/**
 * Guided flash-flow state machine — pure, C2. No esptool-js import, no
 * React — the actual esptool-js orchestration lives in the React shell
 * (src/components/flash/flash-flow.tsx), which dispatches these actions as
 * real async steps complete. Keeping the transition logic here, separate
 * from the I/O, is what makes it unit-testable without hardware.
 */

export type FlashPhase = "boot-guidance" | "connecting" | "flashing" | "resetting" | "done" | "error";

export type FlashErrorKind = "wrong-mode" | "port-busy" | "generic";

export interface FlashFlowState {
  phase: FlashPhase;
  /** 0-100, meaningful during "flashing" (holds at 100 through "resetting"). */
  progressPercent: number;
  /** Set only in the "error" phase. */
  errorMessage: string | null;
  /** Set only in the "error" phase — drives which recovery button/copy shows. */
  errorKind: FlashErrorKind | null;
}

export type FlashFlowAction =
  | { type: "beginFlash" }
  | { type: "restart" }
  | { type: "connected" }
  | { type: "progress"; percent: number }
  | { type: "flashComplete" }
  | { type: "resetComplete" }
  | { type: "failed"; message: string; kind: FlashErrorKind };

export const initialFlashFlowState: FlashFlowState = {
  phase: "boot-guidance",
  progressPercent: 0,
  errorMessage: null,
  errorKind: null,
};

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Guarded transitions only — an action that doesn't make sense from the
 * current phase (a stale "progress" callback firing after the attempt has
 * already failed, say) is a no-op instead of corrupting the visible state.
 * "failed" and "restart" are the exceptions: abandoning an attempt has to
 * work from anywhere.
 */
export function flashFlowReducer(state: FlashFlowState, action: FlashFlowAction): FlashFlowState {
  switch (action.type) {
    case "restart":
      return initialFlashFlowState;
    case "failed":
      return { ...state, phase: "error", errorMessage: action.message, errorKind: action.kind };
    case "beginFlash":
      return state.phase === "boot-guidance" || state.phase === "error" || state.phase === "done"
        ? { ...initialFlashFlowState, phase: "connecting" }
        : state;
    case "connected":
      return state.phase === "connecting" ? { ...state, phase: "flashing", progressPercent: 0 } : state;
    case "progress":
      return state.phase === "flashing" ? { ...state, progressPercent: clampPercent(action.percent) } : state;
    case "flashComplete":
      return state.phase === "flashing" ? { ...state, phase: "resetting", progressPercent: 100 } : state;
    case "resetComplete":
      return state.phase === "resetting" ? { ...state, phase: "done" } : state;
    default:
      return state;
  }
}

export interface ClassifiedFlashError {
  kind: FlashErrorKind;
  message: string;
}

/**
 * Turn whatever esptool-js / Web Serial rejects a flash attempt with into
 * one of the three recovery shapes the error card knows how to explain to a
 * beginner: repeat the BOOT steps, unplug/replug, or a calm generic retry.
 */
export function classifyFlashError(err: unknown): ClassifiedFlashError {
  // Web Serial's port.open() (called internally by esptool-js's
  // Transport.connect()) throws a DOMException for a port that's already
  // open elsewhere — the same failure shape flash-console.tsx's own
  // friendlyConnectError already classifies for the C1 monitor connect.
  if (err instanceof DOMException && (err.name === "NetworkError" || err.name === "InvalidStateError")) {
    return {
      kind: "port-busy",
      message:
        "That port is busy — it may still be in use by another tab or app. Unplug the board, plug it back in, then try again.",
    };
  }
  const text =
    err instanceof Error || err instanceof DOMException
      ? (err as Error | DOMException).message
      : typeof err === "string"
        ? err
        : "";
  // esptool-js's own message once every reset+sync attempt has failed
  // (esploader.js: `throw new ESPError("Failed to connect with the device")`)
  // — the chip never responded, almost always because it wasn't actually in
  // bootloader/download mode when esptool-js tried to talk to it.
  if (/failed to connect with the device/i.test(text)) {
    return {
      kind: "wrong-mode",
      message: "The board didn't respond in flashing mode. Repeat the BOOT steps below, then try again.",
    };
  }
  return {
    kind: "generic",
    message: text || "Flashing failed. Unplug and replug the board, then try again.",
  };
}

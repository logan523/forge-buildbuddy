"use client";

/**
 * Guided one-tap flash (C2): BOOT-mode guidance -> esptool-js connect/flash
 * over the SAME SerialPort the C1 monitor was using -> hard reset -> hand
 * control back to the caller (FlashConsole), which reopens the monitor on
 * that same port so the user sees the freshly-flashed board's output
 * immediately.
 *
 * The state machine (src/lib/serial/flash-flow.ts) is pure and unit tested.
 * This component is the I/O shell around it — the actual esptool-js calls
 * only make sense against real hardware, so beyond a static render check of
 * the BOOT-guidance panel, this file's behavior is verified by hand, not by
 * jsdom (see the C2 handoff notes for exactly what that leaves unverified).
 */

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { ESPLoader, Transport } from "esptool-js";
import { Button } from "@/components/ui";
import {
  flashFlowReducer,
  initialFlashFlowState,
  classifyFlashError,
  type FlashErrorKind,
} from "@/lib/serial/flash-flow";
import { loadFirmwareManifest, type FirmwareManifest, type FirmwareManifestEntry } from "@/lib/serial/manifest";

const FLASH_BAUD = 460800; // ROM sync is always 115200; ESPLoader.main() auto-upgrades to this once synced.
const DEFAULT_I2C_PINS = { sda: 4, scl: 5 }; // matches firmware.ts's ESP32-C3 defaults and diag.ino's fallback

// C1/C2 only ever target ESP32-C3 — diag.ino is C3-specific, and this is the
// only family compile-firmware.mjs ever writes to the manifest today. A
// future slice that supports other board families will need to pass the
// plan-detected family in here instead of this constant.
const BOARD_FAMILY = "esp32c3";
const FAMILY_LABELS: Record<string, string> = { esp32c3: "ESP32-C3" };

export interface FlashFirmwareSectionProps {
  onStart: (entry: FirmwareManifestEntry) => void;
}

/**
 * The gate that decides whether "Flash test firmware" exists at all: loads
 * the manifest once, then shows either the honest not-built-yet card (no
 * dead button) or the real start button — never both, never a broken state
 * in between.
 */
export function FlashFirmwareSection({ onStart }: FlashFirmwareSectionProps) {
  const [manifest, setManifest] = useState<FirmwareManifest | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFirmwareManifest().then((m) => {
      if (!cancelled) setManifest(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!manifest) return null; // near-instant same-origin fetch — not worth a loading flash

  const entry = manifest.families[BOARD_FAMILY];
  const familyLabel = FAMILY_LABELS[BOARD_FAMILY] ?? BOARD_FAMILY;

  return (
    <div className="pt-3 border-t border-border-subtle">
      {!entry ? (
        <p className="text-xs text-text-muted leading-relaxed">
          The one-tap test firmware isn&apos;t built for {familyLabel} yet — use the code package
          with the Arduino IDE instead.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary leading-relaxed">
            Flash a small test sketch — blinks the onboard LED and scans the I2C bus — to confirm
            the board and wiring are good before writing real firmware.
          </p>
          <Button variant="secondary" size="sm" onClick={() => onStart(entry)}>
            Flash test firmware
          </Button>
        </div>
      )}
    </div>
  );
}

export interface FlashFlowProps {
  /** The exact SerialPort the C1 monitor session already had permission for — reused so the browser never re-prompts. */
  port: SerialPort;
  entry: FirmwareManifestEntry;
  /** Plan-derived I2C pins to configure post-flash; defaults to 4/5 until a future slice wires this from the orchestrator. */
  i2cPins?: { sda: number; scl: number };
  /** Closes the live C1 monitor session — esptool-js needs the port free before it can open its own Transport. */
  closeMonitorSession: () => Promise<void>;
  /** Flash + hard reset succeeded; reopen the monitor on the same port and (best-effort) send the I2C config line. */
  onDone: (pins: { sda: number; scl: number }) => void | Promise<void>;
  onCancel: () => void;
}

export function FlashFlow({ port, entry, i2cPins, closeMonitorSession, onDone, onCancel }: FlashFlowProps) {
  const [state, dispatch] = useReducer(flashFlowReducer, initialFlashFlowState);
  const [statusLine, setStatusLine] = useState("");
  const runningRef = useRef(false);

  const runAttempt = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setStatusLine("");
    dispatch({ type: "beginFlash" });

    let transport: Transport | null = null;
    try {
      // The monitor and esptool-js can't both hold the port open at once.
      await closeMonitorSession();

      transport = new Transport(port, true);
      const loader = new ESPLoader({
        transport,
        baudrate: FLASH_BAUD,
        terminal: {
          clean: () => setStatusLine(""),
          write: (s: string) => setStatusLine(s),
          writeLine: (s: string) => setStatusLine(s),
        },
      });

      await loader.main();
      dispatch({ type: "connected" });

      const binRes = await fetch(entry.bin);
      if (!binRes.ok) throw new Error(`Couldn't load ${entry.bin} (HTTP ${binRes.status}).`);
      const data = new Uint8Array(await binRes.arrayBuffer());

      await loader.writeFlash({
        fileArray: [{ data, address: entry.offset }],
        // "keep" x3: the merged binary's image header already has the right
        // mode/freq/size baked in by the build (arduino-cli's own merge
        // step is itself told "keep" for all three) — nothing here should
        // rewrite it.
        flashMode: "keep",
        flashFreq: "keep",
        flashSize: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex, written, total) => {
          dispatch({ type: "progress", percent: total > 0 ? (written / total) * 100 : 0 });
        },
      });
      dispatch({ type: "flashComplete" });

      await loader.after("hard_reset");
      await transport.disconnect();
      transport = null;

      dispatch({ type: "resetComplete" });
      await onDone(i2cPins ?? DEFAULT_I2C_PINS);
    } catch (err) {
      if (transport) {
        await (transport as Transport).disconnect().catch(() => {});
      }
      const classified = classifyFlashError(err);
      dispatch({ type: "failed", message: classified.message, kind: classified.kind });
    } finally {
      runningRef.current = false;
    }
  }, [port, entry, i2cPins, closeMonitorSession, onDone]);

  return (
    <div className="space-y-4">
      {state.phase === "boot-guidance" && <BootGuidance onContinue={runAttempt} onCancel={onCancel} />}

      {(state.phase === "connecting" || state.phase === "resetting" || state.phase === "done") && (
        <BusyPanel
          heading={
            state.phase === "connecting"
              ? "Connecting…"
              : state.phase === "resetting"
                ? "Restarting your board…"
                : "Done — reconnecting…"
          }
          caption={statusLine}
        />
      )}

      {state.phase === "flashing" && (
        <FlashingPanel sketchLabel={entry.sketch} percent={state.progressPercent} caption={statusLine} />
      )}

      {state.phase === "error" && (
        <ErrorPanel
          kind={state.errorKind ?? "generic"}
          message={state.errorMessage ?? "Flashing failed."}
          onRetry={() => (state.errorKind === "port-busy" ? runAttempt() : dispatch({ type: "restart" }))}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function BootGuidance({ onContinue, onCancel }: { onContinue: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-text">Put your board in flashing mode</h4>
        <p className="text-sm text-text-secondary leading-relaxed mt-1">
          Hold the BOOT button, tap RESET, then release BOOT — the board enters flashing mode. Many
          ESP32-C3 boards do this on their own, so if you don&apos;t see separate BOOT and RESET
          buttons, just continue.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onContinue}>
          Continue
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function BusyPanel({ heading, caption }: { heading: string; caption: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Spinner />
        <h4 className="text-sm font-semibold text-text">{heading}</h4>
      </div>
      {caption && <p className="text-xs text-text-muted font-mono truncate">{caption}</p>}
    </div>
  );
}

function FlashingPanel({
  sketchLabel,
  percent,
  caption,
}: {
  sketchLabel: string;
  percent: number;
  caption: string;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-text">Flashing {sketchLabel}…</h4>
      <div
        role="progressbar"
        aria-label="Flashing progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full rounded-full bg-surface-overlay overflow-hidden"
      >
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted font-mono truncate">{caption}</p>
        <p className="text-xs text-text-muted shrink-0">{percent}%</p>
      </div>
    </div>
  );
}

const ERROR_HEADINGS: Record<FlashErrorKind, string> = {
  "wrong-mode": "Board didn't respond",
  "port-busy": "Port is busy",
  generic: "Flashing failed",
};

function ErrorPanel({
  kind,
  message,
  onRetry,
  onCancel,
}: {
  kind: FlashErrorKind;
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-danger-soft border border-danger/15">
      <div>
        <p className="text-sm font-semibold text-danger">{ERROR_HEADINGS[kind]}</p>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={onRetry}>
          {kind === "wrong-mode" ? "Repeat the BOOT steps" : "Try again"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Local diagnostics ring buffer (F6 / eng review).
 *
 * Zero-silent-failures support: every rescue path (compiler wrap, API
 * fail-closed, storage quota) records here so a bug report can carry real
 * context. Local-only — persisted to localStorage, never leaves the device
 * unless the user copies it from the debug drawer.
 *
 * SSR-safe: applyTrustPipeline also runs server-side (pipeline/run.ts), so
 * every entry point no-ops when localStorage is unavailable.
 */

export type DiagKind =
  | "compile_error"
  | "validator"
  | "api_error"
  | "quota"
  | "speech"
  | "step_complete"
  | "info";

export interface DiagEvent {
  ts: string;
  kind: DiagKind;
  detail: string;
}

const KEY = "forge:diag";
const MAX_EVENTS = 50;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function read(store: Storage): DiagEvent[] {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagEvent[]) : [];
  } catch {
    return [];
  }
}

/** Record an event. Never throws; no-op on the server or when storage is blocked. */
export function diagLog(kind: DiagKind, detail: string): void {
  const store = storage();
  if (!store) return;
  try {
    const events = read(store);
    events.push({ ts: new Date().toISOString(), kind, detail: detail.slice(0, 500) });
    store.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Quota or serialization failure — diagnostics must never break the app.
  }
}

export function diagRead(): DiagEvent[] {
  const store = storage();
  return store ? read(store) : [];
}

export function diagClear(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Plain-text export for the "Copy diagnostics" button. */
export function diagCopyText(): string {
  return diagRead()
    .map((e) => `${e.ts} [${e.kind}] ${e.detail}`)
    .join("\n");
}

/**
 * Firmware manifest loader — pure fetch + validate, C2.
 *
 * public/firmware/manifest.json is written by scripts/compile-firmware.mjs
 * (dev-time tooling, requires arduino-cli — see that script's header). On a
 * fresh checkout, or any machine without arduino-cli, the file is the honest
 * empty shape `{"families":{}}` that ships in the repo. This loader treats
 * that identically to a 404, a network error, or a malformed/wrong-shaped
 * response — every failure mode resolves to the same empty manifest, so
 * callers never need a try/catch, just `manifest.families[family]`.
 */

export interface FirmwareManifestEntry {
  /** Path under /public the browser fetches, e.g. "/firmware/esp32c3/diag.bin". */
  bin: string;
  /** Flash address to write the (merged, single-file) binary at. */
  offset: number;
  /** ISO timestamp of the compile-firmware.mjs run that produced it. */
  builtAt: string;
  /** Human label for what's flashed, e.g. "diag v1". */
  sketch: string;
}

export interface FirmwareManifest {
  families: Record<string, FirmwareManifestEntry>;
}

export const EMPTY_MANIFEST: FirmwareManifest = { families: {} };

function isEntry(v: unknown): v is FirmwareManifestEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.bin === "string" &&
    typeof e.offset === "number" &&
    typeof e.builtAt === "string" &&
    typeof e.sketch === "string"
  );
}

/**
 * Drop anything that doesn't match the shape rather than trusting the file
 * wholesale — a hand-edited or half-written manifest should degrade to
 * "missing for this family," never crash the flash flow.
 */
function validate(raw: unknown): FirmwareManifest {
  if (!raw || typeof raw !== "object") return { families: {} };
  const families = (raw as Record<string, unknown>).families;
  if (!families || typeof families !== "object") return { families: {} };
  const out: Record<string, FirmwareManifestEntry> = {};
  for (const [key, value] of Object.entries(families as Record<string, unknown>)) {
    if (isEntry(value)) out[key] = value;
  }
  return { families: out };
}

/**
 * Fetch + validate public/firmware/manifest.json. Every failure mode — 404
 * (nobody has run `npm run firmware:diag` yet), network error, malformed
 * JSON, or a wrong-shaped file — resolves to the same empty manifest rather
 * than throwing, so the "Flash test firmware" UI always has an honest state
 * to render instead of a broken one.
 *
 * `fetchImpl` defaults to the ambient global `fetch`; tests inject a mock
 * instead of touching the network.
 */
export async function loadFirmwareManifest(fetchImpl: typeof fetch = fetch): Promise<FirmwareManifest> {
  try {
    const res = await fetchImpl("/firmware/manifest.json");
    if (!res.ok) return { families: {} };
    const raw: unknown = await res.json();
    return validate(raw);
  } catch {
    return { families: {} };
  }
}

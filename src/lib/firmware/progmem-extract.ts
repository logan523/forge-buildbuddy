/**
 * Extracts real `PROGMEM` byte arrays straight out of Arduino sketch
 * source, Track B3 (rebuild cycle). This is the exact regex-extraction
 * technique proved out by hand this session (byte-for-byte, never
 * hand-retyped) against `bitmaps.h`/`mars-and-back.h`/`propose.h` — a
 * self-built HTML simulator that regex-extracted the real bytes and
 * re-implemented the same draw math in JS, generalized here into a real,
 * reusable module. Same "provably derived, never hand-drawn" principle the
 * Conformance Ledger (`src/lib/electrical/conformance.ts`) already applies
 * to the wiring/3D side, applied here to firmware's static assets.
 *
 * Pure, no I/O — takes source text in, hands typed data out.
 */

export type DimensionSource = "drawBitmap-call" | "inferred-square" | "unknown";

export interface ExtractedBitmap {
  /** The PROGMEM array's own name, e.g. "heart_f0". */
  name: string;
  /** Which source file it came from. */
  file: string;
  /** Raw byte values, in source order — MSB-first per byte, row-major, matching Adafruit_GFX's drawBitmap format. */
  bytes: number[];
  width: number | null;
  height: number | null;
  dimensionSource: DimensionSource;
}

interface RawFile {
  path: string;
  contents: string;
}

/** `const unsigned char PROGMEM name[] = { ...bytes... };` — the raw bitmap data. */
const PROGMEM_ARRAY_RE = /const\s+unsigned\s+char\s+PROGMEM\s+(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}\s*;/g;

/** `const unsigned char* const name[] = { f0, f1, f2 };` — a frame group naming sibling arrays that share dimensions (an animation's frames). */
const FRAME_GROUP_RE = /const\s+unsigned\s+char\s*\*\s*const\s+(\w+)\s*\[\s*\]\s*=\s*\{([^}]*)\}\s*;/g;

/**
 * `display.drawBitmap(x, y, name, W, H, color)` — the one place
 * width/height actually exist in a sketch. W/H are captured as bare
 * identifiers because they're just as often a `#define` constant
 * (`EARTH_GLOBE_D`, as the real weather-clock firmware uses) as a literal
 * number — resolved against DEFINE_RE below before use.
 */
const DRAW_BITMAP_RE = /\.drawBitmap\s*\([^,]+,[^,]+,\s*(\w+)(?:\s*\[[^\]]*\])?\s*,\s*(\w+)\s*,\s*(\w+)\s*,/g;

/** `#define NAME value` — resolves a drawBitmap call's W/H when it's a named constant rather than a literal number. */
const DEFINE_RE = /^\s*#define\s+(\w+)\s+(\d+)\s*$/gm;

function parseByteList(body: string): number[] {
  return body
    .split(",")
    .map((tok) => tok.trim())
    .filter(Boolean)
    .map((tok) => (/^0x/i.test(tok) ? parseInt(tok, 16) : parseInt(tok, 10)))
    .filter((n) => Number.isFinite(n));
}

/** Every plain identifier token in a `{ a, b, c }` list — used to tell a frame-group array (identifiers) apart from a byte array (numbers), and to read its members. */
function parseIdentifierList(body: string): string[] {
  return body
    .split(",")
    .map((tok) => tok.trim())
    .filter((tok) => /^[A-Za-z_]\w*$/.test(tok));
}

export function extractProgmemArrays(files: RawFile[]): ExtractedBitmap[] {
  const byName = new Map<string, ExtractedBitmap>();

  for (const f of files) {
    const re = new RegExp(PROGMEM_ARRAY_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.contents)) !== null) {
      const name = m[1];
      if (byName.has(name)) continue; // first definition wins — shouldn't collide in a real sketch
      byName.set(name, {
        name,
        file: f.path,
        bytes: parseByteList(m[2]),
        width: null,
        height: null,
        dimensionSource: "unknown",
      });
    }
  }

  // Frame groups: propagate a dimension resolved for one member to all
  // siblings (an animation's frames are always the same size) — built
  // before resolving drawBitmap calls below, since a call often addresses
  // the GROUP (`frames[i]`), not a raw byte array, directly.
  const groupMembers = new Map<string, string[]>(); // group name -> member array names
  const memberGroup = new Map<string, string>(); // member array name -> group name
  for (const f of files) {
    const re = new RegExp(FRAME_GROUP_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.contents)) !== null) {
      const groupName = m[1];
      const members = parseIdentifierList(m[2]).filter((id) => byName.has(id));
      if (members.length === 0) continue;
      groupMembers.set(groupName, members);
      for (const id of members) memberGroup.set(id, groupName);
    }
  }

  function applyDimension(name: string, width: number, height: number, source: DimensionSource) {
    const entry = byName.get(name);
    if (entry && entry.dimensionSource === "unknown") {
      entry.width = width;
      entry.height = height;
      entry.dimensionSource = source;
    }
  }

  // `#define NAME 52`-style constants, collected across every file — a
  // drawBitmap call's width/height argument is at least as often one of
  // these as a literal number (e.g. the real weather-clock firmware's
  // `EARTH_GLOBE_D`).
  const defines = new Map<string, number>();
  for (const f of files) {
    const re = new RegExp(DEFINE_RE);
    let dm: RegExpExecArray | null;
    while ((dm = re.exec(f.contents)) !== null) defines.set(dm[1], parseInt(dm[2], 10));
  }
  function resolveNumber(token: string): number | null {
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    return defines.get(token) ?? null;
  }

  for (const f of files) {
    const re = new RegExp(DRAW_BITMAP_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.contents)) !== null) {
      const [, ident, wTok, hTok] = m;
      const width = resolveNumber(wTok);
      const height = resolveNumber(hTok);
      if (width === null || height === null) continue; // an unresolvable expression — leave for the square-inference fallback
      if (byName.has(ident)) {
        applyDimension(ident, width, height, "drawBitmap-call");
      } else if (groupMembers.has(ident)) {
        for (const member of groupMembers.get(ident)!) applyDimension(member, width, height, "drawBitmap-call");
      }
    }
  }

  // Anything still unresolved: infer a square from total bit count. Bytes
  // are packed at 8px/byte per row with the row padded to a whole byte, so
  // this is only exact when width is a multiple of 8 — clearly labeled as
  // inferred, never presented with the same confidence as a real call site.
  for (const entry of byName.values()) {
    if (entry.dimensionSource !== "unknown") continue;
    const totalBits = entry.bytes.length * 8;
    const side = Math.round(Math.sqrt(totalBits));
    if (side > 0) {
      entry.width = side;
      entry.height = side;
      entry.dimensionSource = "inferred-square";
    }
  }

  return [...byName.values()];
}

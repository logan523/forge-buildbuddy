/**
 * Firmware Rule Check ("FRC") — a small, deliberately narrow static-pattern
 * pass over Arduino sketch source, Track A4 (rebuild cycle). ERC's
 * counterpart for firmware: `docs/ELECTRICAL-CORE.md`'s rule table/severity/
 * gate shape exists because "do not trust the wiring alone" turned out to
 * matter; firmware had zero equivalent until this. Field names deliberately
 * parallel `ErcViolation` (src/lib/electrical/types.ts) — id/severity/rule/
 * title/detail/mitigation — without copying any wiring-specific logic.
 *
 * Two rules, not a linter: both target the exact bug shape that cost a real
 * physical-hardware debugging session — a network connection started once
 * in setup() with no recovery path if it fails or later drops, invisible
 * until someone physically watches the device sit "stuck" forever. A brace-
 * depth counter is enough to extract setup()/loop() bodies (Arduino
 * sketches are guaranteed brace-balanced, since they compile) — no real
 * parser needed for either rule.
 *
 * Deliberately non-blocking, dev-time only in this pass: wired into
 * scripts/compile-firmware.mjs, which prints any warnings after a
 * successful compile rather than failing the build.
 */

export type FrcSeverity = "error" | "warning" | "info";

export interface FrcViolation {
  id: string;
  severity: FrcSeverity;
  rule: string;
  title: string;
  detail: string;
  mitigation: string;
  file: string;
  line?: number;
}

export interface FrcReport {
  errors: FrcViolation[];
  warnings: FrcViolation[];
  infos: FrcViolation[];
  clean: boolean;
}

export interface FrcSourceFile {
  name: string;
  contents: string;
}

// Calls that either start or retry a network connection. Deliberately a
// short, extensible list of exactly what's been seen to matter in practice
// (WiFi.begin from the generated full_app template and the hand-authored
// weather-clock sketch's original bug; wifiMulti.run/WiFi.reconnect as the
// two real retry shapes this codebase's own fix already uses) — not an
// attempt at exhaustive WiFi-API coverage.
const CONNECT_CALLS = ["WiFi.begin(", "wifiMulti.run(", "WiFi.reconnect("];

// A blocking-wait condition on connection status, inside a `while (...)`.
// Matches either the ESP32 WiFi.status() idiom or a generic `!x.connected()`
// idiom (e.g. an Ethernet/MQTT client) — order-agnostic within the
// parenthesized condition since sketches phrase these differently.
const BLOCKING_STATUS_RE = /status\s*\(\s*\)\s*!=\s*\w*connected|!\s*\w+(?:\.\w+)*\.connected\s*\(\s*\)/i;

function lineNumberAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

/** Extracts the text between a `{` at `openBraceIndex` and its matching `}`. */
function extractBracedBody(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let i = openBraceIndex; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(openBraceIndex + 1, i);
    }
  }
  // Unterminated brace — shouldn't happen on a sketch that actually
  // compiles, but return what we have rather than throwing on odd input.
  return source.slice(openBraceIndex + 1);
}

/**
 * Extracts the text between a `(` at `openParenIndex` and its matching `)`,
 * and the index just past that closing paren. Nesting-aware — needed
 * because a while condition can itself contain calls with their own parens
 * (e.g. `while (!client.connected())`), which a naive `[^)]*` regex breaks
 * on by stopping at the first, inner `)`.
 */
function extractParenGroup(source: string, openParenIndex: number): { text: string; endIndex: number } {
  let depth = 0;
  for (let i = openParenIndex; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")") {
      depth--;
      if (depth === 0) return { text: source.slice(openParenIndex + 1, i), endIndex: i + 1 };
    }
  }
  return { text: source.slice(openParenIndex + 1), endIndex: source.length };
}

/** Finds the body of the first `void <name>(...) {` in source, if any. */
function findFunctionBody(source: string, name: string): string | null {
  const sigRe = new RegExp(`\\bvoid\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = sigRe.exec(source);
  if (!m) return null;
  const openBrace = m.index + m[0].length - 1;
  return extractBracedBody(source, openBrace);
}

/**
 * Rule NET_SETUP_NO_RETRY: a connect call appears in setup() but none of
 * the known connect/retry calls appear anywhere in loop(). Presence-based
 * on purpose — this doesn't verify the retry is correctly gated (e.g.
 * actually conditioned on "not connected"), only that SOME retry attempt
 * exists at all. Checked against `scripts/firmware-src/weather-clock/
 * weather-clock.ino`'s Wi-Fi watchdog (added after the real bug this rule
 * models) as the positive case, and `src/lib/firmware.ts`'s generated
 * full_app template as a confirmed-live negative case.
 */
function checkNetSetupNoRetry(setupBody: string, loopBody: string, fileName: string): FrcViolation[] {
  const setupHasConnect = CONNECT_CALLS.some((c) => setupBody.includes(c));
  if (!setupHasConnect) return [];
  const loopHasRetry = CONNECT_CALLS.some((c) => loopBody.includes(c));
  if (loopHasRetry) return [];
  return [
    {
      id: "NET_SETUP_NO_RETRY",
      severity: "warning",
      rule: "NET_SETUP_NO_RETRY",
      title: "Network connect called once in setup(), no retry found in loop()",
      detail:
        "If the initial connection attempt fails or later drops, the sketch as written never tries " +
        "again — it sits in a degraded state (e.g. \"Syncing...\" forever) instead of recovering.",
      mitigation:
        "Retry periodically in loop() when not connected — see scripts/firmware-src/weather-clock/" +
        "weather-clock.ino's Wi-Fi watchdog for the reference shape.",
      file: fileName,
    },
  ];
}

/**
 * Rule LOOP_BLOCKING_WHILE_NO_TIMEOUT: a `while (...)` spinning on a
 * connection-status condition whose own body never references `millis()` —
 * a wait-forever construct, the blocking-spin sibling of the absent-retry
 * bug above. Scanned across the whole file (not just loop()) since this
 * shape is just as real in setup() or a helper function.
 */
function checkLoopBlockingWhileNoTimeout(source: string, fileName: string): FrcViolation[] {
  const violations: FrcViolation[] = [];
  // Nesting-aware: a naive `while\s*\(([^)]*)\)` regex breaks the moment the
  // condition itself contains a call with its own parens, e.g.
  // `while (!client.connected())` — the `[^)]*` stops at the FIRST `)`, the
  // one closing `.connected(`, not the while's own. extractParenGroup below
  // walks paren depth instead, the same way extractBracedBody already does
  // for braces.
  const whileStartRe = /\bwhile\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = whileStartRe.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const { text: condition, endIndex } = extractParenGroup(source, openParen);
    if (!BLOCKING_STATUS_RE.test(condition)) continue;
    const afterParen = source.slice(endIndex).match(/^\s*\{/);
    if (!afterParen) continue; // e.g. `while (...)  ;` with no block body — not a shape we model
    const openBrace = endIndex + afterParen[0].length - 1;
    const body = extractBracedBody(source, openBrace);
    // A deadline can be checked either directly in the while's own
    // condition (`while (status != CONNECTED && millis() < deadline)`) or
    // inside the body (`while (status != CONNECTED) { if (millis() > ...) break; }`)
    // — both are real, common shapes, so either counts as bounded.
    if (condition.includes("millis(") || body.includes("millis(")) continue;
    violations.push({
      id: "LOOP_BLOCKING_WHILE_NO_TIMEOUT",
      severity: "warning",
      rule: "LOOP_BLOCKING_WHILE_NO_TIMEOUT",
      title: "Blocking while-loop on connection status with no millis() deadline",
      detail:
        "This spins forever waiting to connect, with nothing bounding how long it waits — a bad " +
        "connection hangs the whole sketch here rather than continuing and retrying later.",
      mitigation: "Bound the wait with a millis()-based deadline, then fall through and keep running.",
      file: fileName,
      line: lineNumberAt(source, m.index),
    });
  }
  return violations;
}

function buildReport(violations: FrcViolation[]): FrcReport {
  return {
    errors: violations.filter((v) => v.severity === "error"),
    warnings: violations.filter((v) => v.severity === "warning"),
    infos: violations.filter((v) => v.severity === "info"),
    clean: violations.every((v) => v.severity !== "error"),
  };
}

/** Runs both rules against a single file's source (setup()/loop() extracted from this file alone). */
export function runFrc(source: string, fileName = "sketch.ino"): FrcReport {
  const violations: FrcViolation[] = [];
  const setupBody = findFunctionBody(source, "setup");
  const loopBody = findFunctionBody(source, "loop");
  if (setupBody !== null && loopBody !== null) {
    violations.push(...checkNetSetupNoRetry(setupBody, loopBody, fileName));
  }
  violations.push(...checkLoopBlockingWhileNoTimeout(source, fileName));
  return buildReport(violations);
}

/**
 * Runs both rules across a whole sketch directory's files. setup()/loop()
 * are resolved from the first file that defines each (in practice always
 * the same main .ino — this just avoids assuming a single-file sketch).
 * The blocking-while rule is checked independently per file.
 */
export function runFrcOnFiles(files: FrcSourceFile[]): FrcReport {
  const violations: FrcViolation[] = [];

  let setupBody: string | null = null;
  let setupFile = files[0]?.name ?? "sketch.ino";
  let loopBody: string | null = null;
  let loopFile = files[0]?.name ?? "sketch.ino";
  for (const f of files) {
    if (setupBody === null) {
      const s = findFunctionBody(f.contents, "setup");
      if (s !== null) {
        setupBody = s;
        setupFile = f.name;
      }
    }
    if (loopBody === null) {
      const l = findFunctionBody(f.contents, "loop");
      if (l !== null) {
        loopBody = l;
        loopFile = f.name;
      }
    }
  }
  if (setupBody !== null && loopBody !== null) {
    violations.push(...checkNetSetupNoRetry(setupBody, loopBody, loopFile === setupFile ? setupFile : `${setupFile} / ${loopFile}`));
  }

  for (const f of files) {
    violations.push(...checkLoopBlockingWhileNoTimeout(f.contents, f.name));
  }

  return buildReport(violations);
}

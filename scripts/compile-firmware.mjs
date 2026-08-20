#!/usr/bin/env node
/**
 * Firmware compile script — dev-time tooling, C2 + rebuild cycle (Track A).
 *
 * Compiles an Arduino sketch with arduino-cli and drops the result exactly
 * where the app expects it, writing a manifest entry Forge's flash UI reads.
 *
 * Two modes, selected by whether --key is passed:
 *
 *   No args (unchanged since C2) — compiles scripts/firmware-src/diag/diag.ino
 *   for the esp32c3 family and writes manifest.families.esp32c3. This is the
 *   one generic test sketch every board of that family shares.
 *
 *   --key <slug> — compiles an arbitrary sketch directory (a plan's own
 *   hand-authored firmware, not a shared family template) and writes
 *   manifest.customSketches[key] instead. This is what replaced the old
 *   one-off pattern of hand-copying a binary into public/firmware and
 *   hand-typing a raw `arduino-cli compile` invocation with no
 *   --export-binaries flag — the exact mistake that silently produced a
 *   stale binary for hours during the weather-clock build this generalizes
 *   from. Always reach for this script; never hand-type arduino-cli.
 *
 * Every compile also:
 *   - computes a short content-derived build ID (sha256 of the sketch's own
 *     source, truncated) and writes it into a *generated, gitignored*
 *     build_id.h in the sketch directory — never mutates tracked source.
 *     A sketch that `#include`s it and prints FORGE_BUILD_ID first thing in
 *     setup() lets the app confirm post-flash which build is actually
 *     running (see src/components/flash/flash-console.tsx's confirm banner).
 *   - runs a small firmware rule check (src/lib/firmware/frc.mjs) against
 *     the sketch source and prints any warnings — non-blocking, dev-time
 *     only, not a CI gate in this pass.
 *
 * Usage:
 *   npm run firmware:diag                 # unchanged: diag.ino → families.esp32c3
 *   node scripts/compile-firmware.mjs
 *   node scripts/compile-firmware.mjs --sketch scripts/firmware-src/weather-clock \
 *     --key solar-weather-clock --label "Solar Weather Clock v1"
 *
 * Requires (one-time):
 *   brew install arduino-cli
 *   arduino-cli core install esp32:esp32
 *
 * Exit code: 1 whenever the binary wasn't (re)built — arduino-cli missing,
 * the esp32 core missing, or the compile/merge step failing. Deliberately
 * NOT exit 0 on "arduino-cli isn't installed": a script that always exits 0
 * can never gate anything (e.g. a future CI check that a sketch still
 * compiles). Run it by hand today and treat a nonzero exit as "go install
 * arduino-cli," not as a bug in the app.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT, "public", "firmware", "manifest.json");

// One FQBN per board family. Only esp32c3 exists anywhere in this codebase
// today (confirmed: the flash flow hardcodes BOARD_FAMILY = "esp32c3") — add
// a row here if/when a second family shows up, rather than building that
// generality preemptively.
const FQBN_BY_FAMILY = {
  esp32c3: "esp32:esp32:XIAO_ESP32C3",
};

const INSTALL_HINT = `
Compiling firmware needs arduino-cli, and it isn't on PATH.

  1. brew install arduino-cli
  2. arduino-cli core install esp32:esp32

If step 2 fails with "platform not found", arduino-cli also needs
Espressif's board index added once:

  arduino-cli config add board_manager.additional_urls \\
    https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli core update-index

This script is dev-time tooling only — the app itself runs fine without it.
Skipping this just means the flash button shows its honest not-built-yet
state instead of a working flash.
`.trim();

function parseArgs(argv) {
  const args = { sketch: null, key: null, label: null, family: "esp32c3" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--sketch") args.sketch = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--label") args.label = argv[++i];
    else if (a === "--family") args.family = argv[++i];
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));

// Default (no --sketch/--key): exact C2 behavior, byte-for-byte — diag.ino,
// family-keyed manifest entry, "diag.bin" filename. No regression risk for
// existing callers (npm run firmware:diag) that never pass args.
const isCustom = Boolean(cliArgs.key);
const SKETCH_DIR = cliArgs.sketch
  ? path.resolve(ROOT, cliArgs.sketch)
  : path.join(ROOT, "scripts", "firmware-src", "diag");
const FAMILY = cliArgs.family || "esp32c3";
const FQBN = FQBN_BY_FAMILY[FAMILY];
const BUILD_DIR_NAME = FQBN ? FQBN.replace(/:/g, ".") : null;
const OUT_DIR = path.join(ROOT, "public", "firmware", FAMILY);
const OUT_FILENAME = isCustom ? `${cliArgs.key}.bin` : "diag.bin";
const OUT_BIN = path.join(OUT_DIR, OUT_FILENAME);
const OUT_BIN_PUBLIC_PATH = `/firmware/${FAMILY}/${OUT_FILENAME}`;
const SKETCH_LABEL = cliArgs.label || (isCustom ? cliArgs.key : "diag v1");

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!FQBN) fail(`Unknown board family "${FAMILY}" — add it to FQBN_BY_FAMILY in this script.`);

function hasArduinoCli() {
  try {
    execFileSync("arduino-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasArduinoCli()) {
  console.log(INSTALL_HINT);
  process.exit(1);
}

if (!existsSync(SKETCH_DIR)) {
  fail(`Sketch directory not found: ${SKETCH_DIR}`);
}

/**
 * Build-provenance: hash the sketch's OWN source (every .ino/.h/.cpp file,
 * sorted by name for determinism) and write it into a generated header the
 * sketch can print at boot. Deliberately a generated file, not a
 * placeholder-substitution in tracked source — this is the standard
 * embedded-firmware "generated version header" convention: never mutates
 * what a hobbyist actually reads in their own .ino, always directly
 * inspectable (a real file with the real last-build ID in it), and doesn't
 * require copying the sketch to a temp path before compiling (arduino-cli
 * expects the sketch directory name to match the .ino filename).
 */
function computeBuildId(sketchDir) {
  const sourceFiles = readdirSync(sketchDir)
    .filter((f) => /\.(ino|h|hpp|cpp)$/i.test(f) && f !== "build_id.h")
    .sort();
  const hash = createHash("sha256");
  for (const f of sourceFiles) {
    hash.update(readFileSync(path.join(sketchDir, f)));
  }
  return hash.digest("hex").slice(0, 8);
}

const buildId = computeBuildId(SKETCH_DIR);
const builtAt = new Date().toISOString();
const buildIdHeaderPath = path.join(SKETCH_DIR, "build_id.h");
writeFileSync(
  buildIdHeaderPath,
  `// Generated by scripts/compile-firmware.mjs — do not edit, do not commit.\n` +
    `// Regenerated on every compile from a hash of this sketch's own source.\n` +
    `#pragma once\n` +
    `#define FORGE_BUILD_ID "${buildId}"\n` +
    `#define FORGE_BUILT_AT "${builtAt}"\n`
);

console.log(`Compiling ${path.relative(ROOT, SKETCH_DIR)} for ${FQBN} (build ${buildId}) ...`);
try {
  execFileSync("arduino-cli", ["compile", "--fqbn", FQBN, "--export-binaries", SKETCH_DIR], {
    stdio: "inherit",
    cwd: ROOT,
  });
} catch {
  fail(
    "arduino-cli compile failed (see output above). Most likely cause: the esp32 core isn't " +
      "installed yet — run `arduino-cli core install esp32:esp32` (see the install hint in this " +
      "script's header for the board-index step some setups also need)."
  );
}

const buildDir = path.join(SKETCH_DIR, "build", BUILD_DIR_NAME);
if (!existsSync(buildDir)) {
  fail(`Compile reported success but the expected build directory is missing: ${buildDir}`);
}

// arduino-esp32's platform.txt runs a postobjcopy hook that merges
// bootloader + partition table + boot_app0 + app into one flat
// "<project>.merged.bin" unconditionally on every ESP32 build; matching by
// suffix (rather than assuming the exact "<sketch>.ino.merged.bin" prefix)
// keeps this robust to that naming detail changing across core versions.
const merged = readdirSync(buildDir).find((f) => f.endsWith(".merged.bin"));
if (!merged) {
  fail(
    `No merged .bin found in ${buildDir}. Your esp32 core build may be too old to emit one — ` +
      "run `arduino-cli core upgrade esp32:esp32` and try again."
  );
}

// Sanity check the artifact we're about to ship is actually fresh — this is
// exactly the file-mtime forensics that had to be done by hand mid-session
// to discover a stale build, now automated as a hard failure instead of a
// silent bug. Guards against a future regression in this script itself
// (e.g. someone reintroducing a bare `arduino-cli compile .` elsewhere).
const mergedPath = path.join(buildDir, merged);
const mergedAgeMs = Date.now() - statSync(mergedPath).mtimeMs;
if (mergedAgeMs > 5 * 60 * 1000) {
  fail(
    `Compiled artifact at ${mergedPath} is ${Math.round(mergedAgeMs / 1000)}s old — arduino-cli ` +
      "reported success but didn't actually write a fresh binary. This is the exact stale-build " +
      "bug this script exists to prevent; do not ship this artifact."
  );
}

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(mergedPath, OUT_BIN);

const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : { families: {} };
manifest.families = manifest.families || {};
const entry = { bin: OUT_BIN_PUBLIC_PATH, offset: 0, builtAt, sketch: SKETCH_LABEL, buildId };

if (isCustom) {
  manifest.customSketches = manifest.customSketches || {};
  manifest.customSketches[cliArgs.key] = entry;
} else {
  manifest.families[FAMILY] = entry;
}
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✓ Wrote ${path.relative(ROOT, OUT_BIN)}`);
console.log(`✓ Updated ${path.relative(ROOT, MANIFEST_PATH)} (${isCustom ? `customSketches.${cliArgs.key}` : `families.${FAMILY}`}, build ${buildId})`);

// Firmware Rule Check — small, non-blocking, dev-time only (see
// src/lib/firmware/frc.ts). Loaded dynamically + best-effort so this script
// keeps working even before frc.ts exists — Node's native TS type-stripping
// (confirmed on the version this repo runs) lets a plain `.mjs` script
// import a `.ts` module directly, same as scripts/audit-tasks.mjs already
// does under tsx; no build step or extra loader needed here.
try {
  const { runFrcOnFiles } = await import("../src/lib/firmware/frc.ts");
  const sketchFiles = readdirSync(SKETCH_DIR)
    .filter((f) => /\.(ino|h|hpp|cpp)$/i.test(f) && f !== "build_id.h")
    .map((f) => ({ name: f, contents: readFileSync(path.join(SKETCH_DIR, f), "utf8") }));
  const report = runFrcOnFiles(sketchFiles);
  if (report.warnings.length > 0) {
    console.log(`\n⚠ Firmware rule check found ${report.warnings.length} warning(s):`);
    for (const w of report.warnings) {
      console.log(`  [${w.rule}] ${w.title} (${w.file}${w.line ? `:${w.line}` : ""})`);
      console.log(`    ${w.detail}`);
      console.log(`    → ${w.mitigation}`);
    }
  }
} catch {
  // frc.mjs not present yet, or failed to load — non-blocking by design.
}

#!/usr/bin/env node
/**
 * Firmware compile script — dev-time tooling only, C2.
 *
 * Compiles scripts/firmware-src/diag/diag.ino for the ESP32-C3 family with
 * arduino-cli and drops the result exactly where the app expects it:
 *
 *   public/firmware/esp32c3/diag.bin   — merged single-file binary, offset 0x0
 *   public/firmware/manifest.json      — { families: { esp32c3: {...} } }
 *
 * This script is NOT part of the running app — nothing under src/ imports it
 * or shells out to it. It's what a developer with arduino-cli installed runs
 * by hand to (re)build the one-tap "Flash test firmware" binary. The app
 * itself only ever reads whatever this script last produced (or the honest
 * empty manifest checked into the repo, on a machine that has never run
 * this) — see src/lib/serial/manifest.ts, which tolerates a missing/empty
 * manifest instead of showing a broken button.
 *
 * Usage:
 *   npm run firmware:diag
 *   node scripts/compile-firmware.mjs
 *
 * Requires (one-time):
 *   brew install arduino-cli
 *   arduino-cli core install esp32:esp32
 *
 * Exit code: 1 whenever the diag.bin wasn't (re)built — arduino-cli missing,
 * the esp32 core missing, or the compile/merge step failing. Deliberately
 * NOT exit 0 on "arduino-cli isn't installed": a script that always exits 0
 * can never gate anything (e.g. a future CI check that the diag sketch still
 * compiles). Run it by hand today and treat a nonzero exit as "go install
 * arduino-cli," not as a bug in the app.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKETCH_DIR = path.join(ROOT, "scripts", "firmware-src", "diag");
// Seeed XIAO ESP32C3's board definition lives in the esp32:esp32 core and
// targets a generic ESP32-C3 closely enough for our purposes — same chip,
// same flash layout, no XIAO-specific peripherals used by diag.ino.
const FQBN = "esp32:esp32:XIAO_ESP32C3";
const BUILD_DIR_NAME = FQBN.replace(/:/g, "."); // arduino-cli's own export-binaries convention
const OUT_DIR = path.join(ROOT, "public", "firmware", "esp32c3");
const OUT_BIN = path.join(OUT_DIR, "diag.bin");
const MANIFEST_PATH = path.join(ROOT, "public", "firmware", "manifest.json");

const INSTALL_HINT = `
The one-tap test firmware needs arduino-cli to build, and it isn't on PATH.

  1. brew install arduino-cli
  2. arduino-cli core install esp32:esp32

If step 2 fails with "platform not found", arduino-cli also needs
Espressif's board index added once:

  arduino-cli config add board_manager.additional_urls \\
    https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
  arduino-cli core update-index

This script is dev-time tooling only — the app itself runs fine without it.
Skipping this just means the "Flash test firmware" button shows its honest
not-built-yet state instead of a working flash.
`.trim();

function hasArduinoCli() {
  try {
    execFileSync("arduino-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

if (!hasArduinoCli()) {
  console.log(INSTALL_HINT);
  process.exit(1);
}

console.log(`Compiling ${path.relative(ROOT, SKETCH_DIR)} for ${FQBN} ...`);
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

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(path.join(buildDir, merged), OUT_BIN);

const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : { families: {} };
manifest.families = manifest.families || {};
manifest.families.esp32c3 = {
  bin: "/firmware/esp32c3/diag.bin",
  offset: 0,
  builtAt: new Date().toISOString(),
  sketch: "diag v1",
};
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

console.log(`\n✓ Wrote ${path.relative(ROOT, OUT_BIN)}`);
console.log(`✓ Updated ${path.relative(ROOT, MANIFEST_PATH)}`);

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProgmemArrays } from "./progmem-extract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKETCH_DIR = path.join(ROOT, "scripts", "firmware-src", "weather-clock");

const SKETCH_FILE_NAMES = [
  "weather-clock.ino",
  "bitmaps.h",
  "mars-and-back.h",
  "propose.h",
  "shooting-star.h",
  "weather-scene.h",
  "world-map.h",
];

function loadSketchFiles() {
  return SKETCH_FILE_NAMES.map((name) => ({
    path: name,
    contents: readFileSync(path.join(SKETCH_DIR, name), "utf8"),
  }));
}

// --- Unit fixtures ------------------------------------------------------------

test("extractProgmemArrays: pulls a raw byte array by name, in source order", () => {
  const source = `
    const unsigned char PROGMEM tiny[] = {
      0x00, 0xFF,
      0x81, 0x81,
    };
  `;
  const result = extractProgmemArrays([{ path: "test.h", contents: source }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "tiny");
  assert.deepEqual(result[0].bytes, [0x00, 0xff, 0x81, 0x81]);
});

test("extractProgmemArrays: decimal byte literals parse the same as hex", () => {
  const source = `const unsigned char PROGMEM tiny[] = { 0, 255, 129, 129 };`;
  const result = extractProgmemArrays([{ path: "test.h", contents: source }]);
  assert.deepEqual(result[0].bytes, [0, 255, 129, 129]);
});

test("extractProgmemArrays: a direct drawBitmap call resolves width/height from real source, not a guess", () => {
  const source = `
    const unsigned char PROGMEM icon[] = { 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x00 };
    void loop() { display.drawBitmap(10, 20, icon, 16, 4, SSD1306_WHITE); }
  `;
  const result = extractProgmemArrays([{ path: "test.ino", contents: source }]);
  assert.equal(result[0].width, 16);
  assert.equal(result[0].height, 4);
  assert.equal(result[0].dimensionSource, "drawBitmap-call");
});

test("extractProgmemArrays: a frame-group array propagates its resolved dimension to every sibling frame", () => {
  const source = `
    const unsigned char PROGMEM heart_f0[] = { 0, 0, 0, 0 };
    const unsigned char PROGMEM heart_f1[] = { 0, 0, 0, 0 };
    const unsigned char* const heart_frames[] = { heart_f0, heart_f1 };
    void loop() { display.drawBitmap(0, 0, heart_frames[i], 16, 16, SSD1306_WHITE); }
  `;
  const result = extractProgmemArrays([{ path: "test.ino", contents: source }]);
  const f0 = result.find((r) => r.name === "heart_f0")!;
  const f1 = result.find((r) => r.name === "heart_f1")!;
  assert.equal(f0.width, 16);
  assert.equal(f0.height, 16);
  assert.equal(f0.dimensionSource, "drawBitmap-call");
  assert.equal(f1.width, 16, "sibling frame gets the same resolved dimension");
  assert.equal(f1.dimensionSource, "drawBitmap-call");
});

test("extractProgmemArrays: no drawBitmap call anywhere — falls back to an honestly-labeled inferred square", () => {
  // 8 bytes = 64 bits = exactly an 8x8 square.
  const source = `const unsigned char PROGMEM mystery[] = { 0,0,0,0,0,0,0,0 };`;
  const result = extractProgmemArrays([{ path: "test.h", contents: source }]);
  assert.equal(result[0].width, 8);
  assert.equal(result[0].height, 8);
  assert.equal(result[0].dimensionSource, "inferred-square");
});

test("extractProgmemArrays: multiple files are all scanned, and drawBitmap in one file resolves an array defined in another", () => {
  const header = { path: "bitmaps.h", contents: `const unsigned char PROGMEM icon[] = { 0,0,0,0 };` };
  const sketch = { path: "app.ino", contents: `void loop() { display.drawBitmap(0,0,icon,8,4,SSD1306_WHITE); }` };
  const result = extractProgmemArrays([header, sketch]);
  assert.equal(result.length, 1);
  assert.equal(result[0].file, "bitmaps.h", "keeps the file it was actually DEFINED in, not where drawBitmap was called");
  assert.equal(result[0].width, 8);
});

// --- Real firmware source: the actual "provably derived" proof --------------

test("extractProgmemArrays against the REAL weather-clock firmware: heart frames resolve to real 16x16 via an actual drawBitmap call, not inference", () => {
  const result = extractProgmemArrays(loadSketchFiles());
  const heartF0 = result.find((r) => r.name === "heart_f0");
  assert.ok(heartF0, "heart_f0 exists in the real bitmaps.h");
  assert.equal(heartF0!.width, 16);
  assert.equal(heartF0!.height, 16);
  assert.equal(heartF0!.dimensionSource, "drawBitmap-call", "resolved from a real drawBitmap(...) call site in weather-clock.ino, not guessed");
  assert.equal(heartF0!.bytes.length, 32, "16x16 at 1bpp = 2 bytes/row * 16 rows");
});

test("extractProgmemArrays against the REAL weather-clock firmware: earth_globe frames resolve to real 52x52 — via a #define constant (EARTH_GLOBE_D), not a literal number, proving macro resolution works on genuine source, not just a contrived fixture", () => {
  const result = extractProgmemArrays(loadSketchFiles());
  const globeF0 = result.find((r) => r.name === "earth_globe_f0");
  assert.ok(globeF0, "earth_globe_f0 must exist in world-map.h");
  assert.equal(globeF0!.width, 52);
  assert.equal(globeF0!.height, 52);
  assert.equal(globeF0!.dimensionSource, "drawBitmap-call");
  assert.equal(globeF0!.bytes.length, 7 * 52, "52x52 at 1bpp = 7 bytes/row (ceil(52/8)) * 52 rows");
});

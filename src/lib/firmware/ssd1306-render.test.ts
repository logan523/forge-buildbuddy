import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderBitmap, pixelAt } from "./ssd1306-render";
import { extractProgmemArrays } from "./progmem-extract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKETCH_DIR = path.join(ROOT, "scripts", "firmware-src", "weather-clock");

test("renderBitmap: a fully-off 1x1 bitmap is a single black pixel", () => {
  const r = renderBitmap([0x00], 1, 1);
  assert.equal(r.width, 1);
  assert.equal(r.height, 1);
  assert.equal(pixelAt(r, 0, 0), false);
});

test("renderBitmap: MSB-first bit order — 0x80 lights only the leftmost pixel of a row", () => {
  const r = renderBitmap([0x80], 8, 1);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, x) => pixelAt(r, x, 0)),
    [true, false, false, false, false, false, false, false]
  );
});

test("renderBitmap: 0x01 lights only the rightmost pixel of an 8px row", () => {
  const r = renderBitmap([0x01], 8, 1);
  assert.deepEqual(
    Array.from({ length: 8 }, (_, x) => pixelAt(r, x, 0)),
    [false, false, false, false, false, false, false, true]
  );
});

test("renderBitmap: a width that isn't a multiple of 8 still pads each row to a whole byte, MSB-first", () => {
  // width=4: 1 byte/row. 0xF0 = 11110000 — only the top 4 bits are real pixels.
  const r = renderBitmap([0xf0], 4, 1);
  assert.deepEqual(
    Array.from({ length: 4 }, (_, x) => pixelAt(r, x, 0)),
    [true, true, true, true]
  );
});

test("renderBitmap: multi-row layout advances one full row of bytesPerRow at a time", () => {
  // 16px wide = 2 bytes/row. Row 0: 0xFF,0x00 (left half lit). Row 1: 0x00,0xFF (right half lit).
  const r = renderBitmap([0xff, 0x00, 0x00, 0xff], 16, 2);
  assert.equal(pixelAt(r, 0, 0), true);
  assert.equal(pixelAt(r, 8, 0), false);
  assert.equal(pixelAt(r, 0, 1), false);
  assert.equal(pixelAt(r, 8, 1), true);
});

test("renderBitmap: RGBA channels are grayscale + fully opaque (on=white, off=black, alpha=255)", () => {
  const r = renderBitmap([0x80], 8, 1);
  // pixel (0,0) is ON:
  assert.deepEqual([r.pixels[0], r.pixels[1], r.pixels[2], r.pixels[3]], [255, 255, 255, 255]);
  // pixel (1,0) is OFF:
  assert.deepEqual([r.pixels[4], r.pixels[5], r.pixels[6], r.pixels[7]], [0, 0, 0, 255]);
});

// --- Real firmware bytes: the actual "provably derived, never hand-drawn" proof ---
//
// Extract the REAL heart_f2 (the "full bloom" heart frame) bytes straight out
// of the real bitmaps.h via progmem-extract.ts, render them, and assert
// specific pixel coordinates by independently re-deriving expected on/off
// state from the SAME raw byte array — not by trusting the implementation's
// own output, and not by hand-retyping a bitmap into the test. This is what
// makes the "exactly what the firmware will draw" claim provable rather than
// asserted: the same rigor conformance.ts's bijection tests already apply to
// the wiring/3D side, applied here to a firmware static asset.

function expectedPixel(bytes: number[], width: number, x: number, y: number): boolean {
  const bytesPerRow = Math.ceil(width / 8);
  const byteIndex = Math.floor(x / 8);
  const bit = x % 8;
  const byte = bytes[y * bytesPerRow + byteIndex] ?? 0;
  return ((byte >> (7 - bit)) & 1) === 1;
}

test("renderBitmap against the REAL heart_f2 frame (bitmaps.h): every pixel matches an independent re-derivation from the same raw bytes", () => {
  const files = ["weather-clock.ino", "bitmaps.h", "mars-and-back.h"].map((name) => ({
    path: name,
    contents: readFileSync(path.join(SKETCH_DIR, name), "utf8"),
  }));
  const extracted = extractProgmemArrays(files);
  const heartF2 = extracted.find((e) => e.name === "heart_f2")!;
  assert.ok(heartF2, "heart_f2 exists in the real bitmaps.h");
  assert.equal(heartF2.width, 16);
  assert.equal(heartF2.height, 16);

  const rendered = renderBitmap(heartF2.bytes, heartF2.width!, heartF2.height!);

  let checked = 0;
  for (let y = 0; y < heartF2.height!; y++) {
    for (let x = 0; x < heartF2.width!; x++) {
      assert.equal(
        pixelAt(rendered, x, y),
        expectedPixel(heartF2.bytes, heartF2.width!, x, y),
        `pixel (${x},${y}) mismatch against the real heart_f2 bytes`
      );
      checked++;
    }
  }
  assert.equal(checked, 256, "every pixel of the 16x16 frame was actually checked");

  // Sanity check it's recognizably a heart, not garbage: the top-left
  // corner is empty (hearts don't fill their bounding box), and there's at
  // least one lit pixel near the vertical center (the heart's body).
  assert.equal(pixelAt(rendered, 0, 0), false);
  const centerRow = 8;
  const litInCenterRow = Array.from({ length: 16 }, (_, x) => pixelAt(rendered, x, centerRow)).some(Boolean);
  assert.ok(litInCenterRow, "the heart's body should light up pixels in its middle row");
});

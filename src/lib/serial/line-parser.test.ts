import { test } from "node:test";
import assert from "node:assert/strict";
import { LineSplitter, parseScannerLine } from "./line-parser";

test("LineSplitter: single chunk with one terminated line", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("hello\n"), ["hello"]);
  assert.equal(s.pendingTail(), "");
});

test("LineSplitter: multiple lines in one chunk, in order", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("one\ntwo\nthree\n"), ["one", "two", "three"]);
});

test("LineSplitter: partial tail is buffered, not emitted, until terminated", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("Forge I2C sc"), []);
  assert.equal(s.pendingTail(), "Forge I2C sc");
  assert.deepEqual(s.push("anner\n"), ["Forge I2C scanner"]);
  assert.equal(s.pendingTail(), "");
});

test("LineSplitter: a line split across many small chunks reassembles correctly", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("F"), []);
  assert.deepEqual(s.push("ound "), []);
  assert.deepEqual(s.push("device at "), []);
  assert.deepEqual(s.push("0x3C"), []);
  assert.deepEqual(s.push("\n"), ["Found device at 0x3C"]);
});

test("LineSplitter: \\r\\n terminator strips the \\r", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("SDA=GPIO4  SCL=GPIO5\r\n"), ["SDA=GPIO4  SCL=GPIO5"]);
});

test("LineSplitter: \\r\\n split exactly across a chunk boundary still strips correctly", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("--- scan ---\r"), []);
  assert.equal(s.pendingTail(), "--- scan ---\r");
  assert.deepEqual(s.push("\nnext"), ["--- scan ---"]);
  assert.equal(s.pendingTail(), "next");
});

test("LineSplitter: bare \\n (no \\r) still works — ESP32 output is inconsistent about this", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("Total: 1\n"), ["Total: 1"]);
});

test("LineSplitter: flush() emits a buffered partial line once, then goes quiet", () => {
  const s = new LineSplitter();
  s.push("no terminator yet");
  assert.deepEqual(s.flush(), ["no terminator yet"]);
  assert.deepEqual(s.flush(), []);
  assert.equal(s.pendingTail(), "");
});

test("LineSplitter: flush() on an empty buffer returns nothing", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.flush(), []);
});

test("LineSplitter: empty lines (blank line in the stream) are preserved, not dropped", () => {
  const s = new LineSplitter();
  assert.deepEqual(s.push("a\n\nb\n"), ["a", "", "b"]);
});

// --- parseScannerLine ---------------------------------------------------
// The exact wire format comes from src/lib/firmware.ts (sketchI2cScanner):
//   Serial.print("Found device at 0x");
//   if (addr < 16) Serial.print("0");
//   Serial.println(addr, HEX);
// i.e. always "Found device at 0x" + exactly two uppercase hex digits.

test("parseScannerLine: matches the exact firmware.ts scanner line for the demo OLED (0x3C)", () => {
  assert.deepEqual(parseScannerLine("Found device at 0x3C"), { kind: "i2c-found", address: 0x3c });
});

test("parseScannerLine: matches the zero-padded low-address form (addr < 16)", () => {
  // e.g. a device at decimal 4 prints as "0x04" (manual zero-pad in the sketch).
  assert.deepEqual(parseScannerLine("Found device at 0x04"), { kind: "i2c-found", address: 4 });
});

test("parseScannerLine: matches the SHT31 address from the generated sketch (0x44)", () => {
  assert.deepEqual(parseScannerLine("Found device at 0x44"), { kind: "i2c-found", address: 0x44 });
});

test("parseScannerLine: highest address the scanner sketch loop reaches (0x7E)", () => {
  assert.deepEqual(parseScannerLine("Found device at 0x7E"), { kind: "i2c-found", address: 0x7e });
});

test("parseScannerLine: hex parsing is case-insensitive on the match itself", () => {
  assert.deepEqual(parseScannerLine("Found device at 0x3c"), { kind: "i2c-found", address: 0x3c });
});

test("parseScannerLine: the sketch's other loop() lines are plain, not i2c-found", () => {
  assert.deepEqual(parseScannerLine("--- scan ---"), { kind: "plain" });
  assert.deepEqual(parseScannerLine("Forge I2C scanner"), { kind: "plain" });
  assert.deepEqual(parseScannerLine("SDA=GPIO4  SCL=GPIO5"), { kind: "plain" });
  assert.deepEqual(parseScannerLine("No I2C devices. Check SDA/SCL swap, 3.3V, GND."), { kind: "plain" });
  assert.deepEqual(parseScannerLine("Total: 2"), { kind: "plain" });
});

test("parseScannerLine: recognizes ESP32 ROM boot noise", () => {
  assert.deepEqual(
    parseScannerLine("rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)"),
    { kind: "boot" }
  );
  assert.deepEqual(parseScannerLine("configsip: 0, SPIWP:0xee"), { kind: "plain" });
});

test("parseScannerLine: boot-noise lines containing '0x' don't get misread as an I2C address", () => {
  assert.deepEqual(parseScannerLine("load:0x3fcd5810,len:0x1900"), { kind: "plain" });
});

test("parseScannerLine: an empty line is plain", () => {
  assert.deepEqual(parseScannerLine(""), { kind: "plain" });
});

test("parseScannerLine: matches the FORGE_BUILD_ID line printed first in setup()", () => {
  assert.deepEqual(parseScannerLine("FORGE_BUILD_ID=a3f9c1c2"), { kind: "build-id", buildId: "a3f9c1c2" });
});

test("parseScannerLine: build ID is lowercased for a case-insensitive compare downstream", () => {
  assert.deepEqual(parseScannerLine("FORGE_BUILD_ID=A3F9C1C2"), { kind: "build-id", buildId: "a3f9c1c2" });
});

test("parseScannerLine: build-id only matches at the start of the line, not embedded elsewhere", () => {
  assert.deepEqual(parseScannerLine("boot log: FORGE_BUILD_ID=a3f9c1c2"), { kind: "plain" });
});

test("parseScannerLine: build-id is checked before i2c-found so it can't be shadowed", () => {
  assert.deepEqual(parseScannerLine("FORGE_BUILD_ID=71b0aa9d"), { kind: "build-id", buildId: "71b0aa9d" });
});

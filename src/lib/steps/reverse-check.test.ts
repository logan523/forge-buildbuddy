import { test } from "node:test";
import assert from "node:assert/strict";
import type { CompiledConnection } from "@/lib/types";
import { reverseCheck, pinOptions, colorOptions } from "./reverse-check";

const conn = (over: Partial<CompiledConnection>): CompiledConnection => ({
  id: "c",
  netName: "SDA",
  netClass: "i2c",
  fromRef: "U1",
  fromPin: "GPIO4",
  fromLabel: "ESP32-C3",
  toRef: "U2",
  toPin: "SDA",
  toLabel: "OLED",
  colorHex: "#2563eb",
  colorName: "blue",
  grade: "consistent",
  domainKey: "signal",
  domainLabel: "Signal",
  domainColorHex: "#94a3b8",
  domainVolts: null,
  ...over,
});

const wiring: CompiledConnection[] = [
  conn({ id: "sda" }),
  conn({ id: "v33", netName: "3V3", netClass: "power", fromPin: "3V3", toPin: "VCC", colorName: "red", domainKey: "3v3", domainLabel: "3.3V", domainVolts: 3.3 }),
  conn({ id: "gnd", netName: "GND", netClass: "gnd", fromPin: "GND", toPin: "GND", colorName: "black", domainKey: "gnd", domainLabel: "GND", domainVolts: 0 }),
  conn({ id: "v5", netName: "VBUS", netClass: "power", fromPin: "5V", toPin: "5V", colorName: "orange", domainKey: "5v", domainLabel: "5V", domainVolts: 5 }),
];

test("correct color on a pin → reassuring OK", () => {
  const r = reverseCheck(wiring, { pin: "VCC", saidColor: "red" });
  assert.equal(r.verdict, "ok");
  assert.match(r.message, /Correct/);
});

test("wrong color → names what the pin actually carries + where the color belongs", () => {
  const r = reverseCheck(wiring, { pin: "GND", saidColor: "red" });
  assert.equal(r.verdict, "wrong");
  assert.match(r.message, /GND/);
  assert.match(r.message, /not red/);
  assert.ok(r.fixHint && /red wire belongs/i.test(r.fixHint), "tells them where red goes");
});

test("crossing two power islands is flagged as dangerous (fry risk)", () => {
  // Said "orange" (a 5V wire) on VCC, which is the 3.3V net → 3.3V↔5V bridge.
  const r = reverseCheck(wiring, { pin: "VCC", saidColor: "orange" });
  assert.equal(r.verdict, "wrong");
  assert.equal(r.danger, true, "3.3V pin + 5V wire = fry risk");
  assert.match(r.message, /different voltages|fry/i);
});

test("a signal-color swap is wrong but not dangerous", () => {
  // Said "black" (GND) on the SDA pin — wrong, but GND isn't a power-island bridge.
  const r = reverseCheck(wiring, { pin: "SDA", saidColor: "black" });
  assert.equal(r.verdict, "wrong");
  assert.notEqual(r.danger, true);
});

test("unknown pin → honest 'I don't see that pin', never a guess", () => {
  const r = reverseCheck(wiring, { pin: "A17", saidColor: "red" });
  assert.equal(r.verdict, "unknown");
});

test("pinOptions / colorOptions dedupe for the pickers", () => {
  assert.ok(pinOptions(wiring).some((p) => p.pin === "SDA" && p.label === "OLED"));
  const colors = colorOptions(wiring);
  assert.deepEqual([...new Set(colors)], colors, "no duplicate colors");
  assert.ok(colors.includes("red") && colors.includes("blue"));
});

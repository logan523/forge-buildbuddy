import { test } from "node:test";
import assert from "node:assert/strict";
import { explainNode, type ExplainWire } from "./explain-part";

const w = (netClass: string, otherLabel: string, netName = "N"): ExplainWire => ({
  netClass,
  netName,
  otherLabel,
});

test("names the part's role in plain English", () => {
  const e = explainNode("brain", "ESP32-C3", [w("i2c", "OLED")]);
  assert.match(e.headline, /brain/i);
  assert.match(e.headline, /ESP32-C3/);
});

test("groups connections into what they DO (power / data / ground)", () => {
  const e = explainNode("brain", "ESP32-C3", [
    w("power", "OLED"),
    w("i2c", "OLED"),
    w("i2c", "OLED"),
    w("gnd", "OLED"),
  ]);
  assert.ok(e.points.some((p) => /shares power/i.test(p)));
  assert.ok(e.points.some((p) => /talks to OLED over 2 data wires/i.test(p)), "counts the data wires");
  assert.ok(e.points.some((p) => /shares ground/i.test(p)));
});

test("dedupes the other-end parts and lists them naturally", () => {
  const e = explainNode("brain", "ESP32-C3", [w("gnd", "OLED"), w("gnd", "Sensor"), w("gnd", "OLED")]);
  const gnd = e.points.find((p) => /ground/i.test(p))!;
  assert.match(gnd, /OLED and Sensor/, "two distinct parts, joined with 'and'");
});

test("an unwired part says so honestly instead of inventing connections", () => {
  const e = explainNode("face", "OLED", []);
  assert.match(e.points[0]!, /isn't wired/i);
});

test("unknown node falls back to a keyword role, never a crash", () => {
  assert.match(explainNode("x9", "TP4056 charger", [w("power", "battery")]).headline, /charger/i);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  netColorFor,
  wireColorName,
  colorConflict,
  wireLegend,
  WIRE_NAME_HEX,
  NET_CLASS_HEX,
} from "./wire-colors";

test("V5 precedence: class color wins over plan-supplied color on classed nets", () => {
  // The demo's actual contradiction: SHT31 SDA edge said "green", net class i2c.
  assert.equal(netColorFor("i2c", "green", "SDA"), WIRE_NAME_HEX.blue);
  assert.equal(netColorFor("power", "blue"), WIRE_NAME_HEX.red);
  assert.equal(netColorFor("gnd", "#ff0000"), WIRE_NAME_HEX.black);
});

test("well-known net names stay distinguishable within a class (SDA≠SCL)", () => {
  assert.equal(netColorFor("i2c", undefined, "SDA"), WIRE_NAME_HEX.blue);
  assert.equal(netColorFor("i2c", undefined, "SCL"), WIRE_NAME_HEX.yellow);
  assert.notEqual(netColorFor("i2c", undefined, "SDA"), netColorFor("i2c", undefined, "SCL"));
});

test("unclassed nets honor the plan-supplied color", () => {
  assert.equal(netColorFor("other", "green"), WIRE_NAME_HEX.green);
  assert.equal(netColorFor("other", "eab308"), "#eab308");
  assert.equal(netColorFor("other"), NET_CLASS_HEX.other);
  assert.equal(netColorFor("other", "not-a-color"), NET_CLASS_HEX.other);
});

test("colorConflict flags plan colors that fight the authority (validator input)", () => {
  assert.equal(colorConflict("i2c", "green", "SDA"), true, "the demo bug");
  assert.equal(colorConflict("i2c", "blue", "SDA"), false);
  assert.equal(colorConflict("i2c", "yellow", "SCL"), false);
  assert.equal(colorConflict("other", "green"), false, "unclassed nets are free");
  assert.equal(colorConflict("power", undefined), false);
});

test("wireColorName round-trips the palette for step text", () => {
  assert.equal(wireColorName(WIRE_NAME_HEX.blue), "blue");
  assert.equal(wireColorName(WIRE_NAME_HEX.yellow), "yellow");
  assert.equal(wireColorName("#1e293b"), "black");
  assert.equal(wireColorName("#123456"), "colored");
});

test("legend derives from the same authority values", () => {
  const legend = wireLegend();
  const sda = legend.find((l) => l.meaning.includes("SDA"));
  const scl = legend.find((l) => l.meaning.includes("SCL"));
  assert.equal(sda?.color, WIRE_NAME_HEX.blue);
  assert.equal(scl?.color, WIRE_NAME_HEX.yellow);
  assert.equal(legend.find((l) => l.netClass === "power")?.color, WIRE_NAME_HEX.red);
});

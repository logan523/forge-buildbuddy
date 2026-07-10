import { test } from "node:test";
import assert from "node:assert/strict";
import { domainForVolts, domainForNet, bridgesDomains } from "./voltage-domains";

test("domainForVolts maps the islands a beginner must not cross", () => {
  assert.equal(domainForVolts(3.3).key, "3v3");
  assert.equal(domainForVolts(3.3).label, "3.3V");
  assert.equal(domainForVolts(5).key, "5v");
  assert.equal(domainForVolts(3.7).key, "batt", "Li-ion cell voltage is its own island");
  assert.equal(domainForVolts(0).key, "gnd");
  assert.equal(domainForVolts(undefined).key, "signal", "no domain volts → signal, not a power island");
  assert.equal(domainForVolts(12).key, "pwr");
  assert.equal(domainForVolts(12).label, "12V");
});

test("each island has a stable, distinct color", () => {
  const keys = [3.3, 5, 3.7, 0].map((v) => domainForVolts(v).colorHex);
  assert.equal(new Set(keys).size, 4, "3.3V / 5V / battery / GND are visually distinct");
});

test("domainForNet: GND by class or name, else members' domain volts", () => {
  assert.equal(domainForNet({ netClass: "gnd", members: [{ domainV: 0 }] }).key, "gnd");
  assert.equal(domainForNet({ name: "GND", netClass: "power", members: [] }).key, "gnd", "name wins for ground");
  assert.equal(domainForNet({ netClass: "power", members: [{ domainV: 3.3 }] }).key, "3v3");
  assert.equal(domainForNet({ netClass: "i2c", members: [{}] }).key, "signal");
});

test("bridgesDomains flags the danger: two different POWER islands, not signal/gnd", () => {
  const v33 = domainForVolts(3.3);
  const v5 = domainForVolts(5);
  const sig = domainForVolts(undefined);
  const gnd = domainForVolts(0);
  assert.equal(bridgesDomains(v33, v5), true, "3.3V ↔ 5V is the classic fry-it mistake");
  assert.equal(bridgesDomains(v33, v33), false, "same island is fine");
  assert.equal(bridgesDomains(sig, v5), false, "a signal line isn't a voltage bridge");
  assert.equal(bridgesDomains(gnd, v5), false, "ground is shared, not a bridge");
});

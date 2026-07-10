import { test } from "node:test";
import assert from "node:assert/strict";
import type { Part } from "@/lib/types";
import { buildIsolationWalk, isolationCulprit } from "./isolation-walk";

const part = (name: string, catalogId?: string): Part =>
  ({ id: name, name, specification: "", quantity: 1, catalogId }) as Part;

test("brain goes first; real peripherals become the reconnect order", () => {
  const walk = buildIsolationWalk([
    part("OLED display", "oled_096"),
    part("ESP32-C3 SuperMini", "esp32_c3"),
    part("SHT30 sensor", "sht30"),
    part("jumper wires"),
    part("bamboo enclosure"),
  ])!;
  assert.match(walk.brainLabel, /ESP32/);
  assert.deepEqual(walk.addOrder, ["OLED display", "SHT30 sensor"], "wires + enclosure are not reconnectable modules");
});

test("no brain in the BOM → no walk (can't run the detective)", () => {
  assert.equal(buildIsolationWalk([part("battery"), part("resistor")]), null);
});

test("names the exact culprit at the step the board died", () => {
  const walk = { brainLabel: "ESP32-C3", addOrder: ["OLED", "SHT30", "TP4056"] };
  assert.equal(isolationCulprit(walk, 1), "SHT30");
  assert.equal(isolationCulprit(walk, 99), "the last part you added", "out of range never crashes");
});

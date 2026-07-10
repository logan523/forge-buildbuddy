import { test } from "node:test";
import assert from "node:assert/strict";
import type { BuildPlan, Part } from "@/lib/types";
import { rankNextBuilds } from "./next-builds";

const part = (name: string, catalogId?: string): Part =>
  ({ id: name, name, specification: "", quantity: 1, catalogId }) as Part;

const plan = (over: Partial<BuildPlan>): BuildPlan =>
  ({ id: over.id ?? "p", title: over.title ?? "P", difficulty: "beginner", parts: [], steps: [], ...over }) as BuildPlan;

const finished = plan({
  id: "clock",
  title: "Solar Clock",
  difficulty: "intermediate",
  parts: [part("ESP32-C3", "esp32_c3"), part("OLED", "oled_096"), part("TP4056", "tp4056"), part("16340 cell", "cell_16340")],
});

test("ranks by bench reuse: the build that shares the most parts wins", () => {
  const overlap3 = plan({ id: "a", title: "Weather Station", parts: [part("ESP32-C3", "esp32_c3"), part("OLED", "oled_096"), part("TP4056", "tp4056"), part("SHT30", "sht30")] });
  const overlap1 = plan({ id: "b", title: "Blink", parts: [part("ESP32-C3", "esp32_c3"), part("LED", "generic_pcb")] });
  const ranked = rankNextBuilds(finished, [overlap1, overlap3]);
  assert.equal(ranked[0]?.plan.id, "a", "3-shared beats 1-shared");
  assert.equal(ranked[0]?.sharedParts, 3);
  assert.equal(ranked[0]?.newParts, 1, "you'd only buy the SHT30");
});

test("excludes the build you just finished, and builds that reuse nothing", () => {
  const same = plan({ id: "clock", title: "Solar Clock", parts: finished.parts });
  const unrelated = plan({ id: "c", title: "Wooden Stool", parts: [part("plank"), part("screws")] });
  const ranked = rankNextBuilds(finished, [same, unrelated]);
  assert.equal(ranked.length, 0, "no self-suggestion, no zero-overlap suggestion");
});

test("prefers one notch up over a difficulty cliff when overlap ties", () => {
  const oneUp = plan({ id: "adv", title: "Advanced", difficulty: "advanced", parts: [part("ESP32-C3", "esp32_c3")] });
  const same = plan({ id: "int", title: "Intermediate", difficulty: "intermediate", parts: [part("ESP32-C3", "esp32_c3")] });
  // finished is intermediate → advanced is +1 (ideal), intermediate is +0.
  const ranked = rankNextBuilds(finished, [same, oneUp]);
  assert.equal(ranked[0]?.plan.id, "adv", "one notch up is the ideal next challenge");
});

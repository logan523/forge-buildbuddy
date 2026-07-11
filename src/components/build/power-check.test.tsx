import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import type { BuildPlan } from "@/lib/types";
import { PowerCheck } from "./power-check";

afterEach(() => cleanup());

const planWith = (components: unknown[], nets: unknown[]): BuildPlan =>
  ({
    id: "p",
    parts: [],
    steps: [],
    electrical: { components, nets, unboundEdges: [], erc: {}, builtAt: "" },
  }) as unknown as BuildPlan;

const comp = (ref: string, catalogId: string, extra = {}) => ({ ref, partId: ref, name: ref, catalogId, pinoutGrade: "derived", pins: [], ...extra });
const powerNet = (name: string, v: number, refs: string[]) => ({ name, netClass: "power", grade: "derived", members: refs.map((ref) => ({ ref, pin: "V", role: "power", domainV: v })) });

test("shows the delivered voltage and an honest 'estimated' label", () => {
  render(<PowerCheck plan={planWith([comp("U1", "esp32_c3"), comp("U2", "oled_096")], [powerNet("3V3", 3.3, ["U1", "U2"])])} />);
  assert.ok(screen.getByText(/Power check/i));
  assert.ok(screen.getByText(/estimated, not measured/i), "never claims to be measured");
  assert.ok(screen.getByText(/delivers/i));
  assert.ok(screen.getAllByText(/3\.\d{2}V/).length >= 1, "a solved voltage, not just the label");
});

test("an overloaded battery rail warns it browns out on a burst", () => {
  const loads = ["G1", "G2", "G3", "G4", "G5", "G6"].map((r) => comp(r, "generic_pcb"));
  render(
    <PowerCheck
      plan={planWith(
        [comp("B1", "cell_16340", { isLithiumCell: true }), comp("U1", "esp32_c3"), ...loads],
        [powerNet("BAT", 3.7, ["B1", "U1", "G1", "G2", "G3", "G4", "G5", "G6"])]
      )}
    />
  );
  assert.ok(screen.getByText(/browns out/i), "flags the risk");
  assert.ok(screen.getByText(/keeps rebooting/i), "explains the real-world symptom");
});

test("no electrical model → nothing renders (no false readout)", () => {
  const { container } = render(<PowerCheck plan={{ id: "p", parts: [], steps: [] } as unknown as BuildPlan} />);
  assert.equal(container.textContent, "");
});

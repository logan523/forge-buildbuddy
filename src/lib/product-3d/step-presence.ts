/**
 * Derived step presence for templates WITHOUT an authored assembly recipe
 * (weather_stick, robot_chassis, sensor_pod, boxed_gadget, breadboard).
 *
 * Token-matches each step's text (title/description/youNeed) against scene
 * node labels + linked part names to decide which parts have "arrived" by a
 * given step. Presence is cumulative — a part mentioned in step 3 stays
 * visible from step 3 on — so the stage builds up over the walk instead of
 * showing the finished product on step 1.
 *
 * Guard (eng review): if fewer than 60% of steps match at least one node,
 * the derivation is too weak to trust — return null and the stage falls back
 * to the full product (highlight-only). Never wrongly hide a part.
 */

import type { BuildPlan, BuildStep } from "@/lib/types";
import type { SceneNode3D } from "./types";

const STOP = new Set([
  "the", "and", "with", "for", "your", "into", "onto", "all", "then",
  "module", "board", "wire", "wires", "panel", "part", "parts",
]);

function tokensOf(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

function nodeTokens(node: SceneNode3D, plan: BuildPlan): Set<string> {
  const part = plan.parts?.find((p) => p.id === node.partId);
  return tokensOf(`${node.label} ${part?.name ?? ""} ${node.catalogId ?? ""}`);
}

function stepTokens(step: BuildStep): Set<string> {
  return tokensOf(
    `${step.title} ${step.description} ${(step.youNeed || []).join(" ")}`
  );
}

export interface StepPresence {
  /** Node ids present (cumulative) per step index. */
  presentByStep: Map<number, Set<string>>;
  /** Node ids first mentioned by this step — the "what's new" highlight set. */
  arrivedByStep: Map<number, Set<string>>;
}

/**
 * Returns null when derivation is too weak (guard) — caller falls back to
 * showing the full product.
 */
export function deriveStepPresence(
  plan: BuildPlan,
  steps: BuildStep[],
  nodes: SceneNode3D[]
): StepPresence | null {
  if (!steps.length || !nodes.length) return null;

  const nodeTok = nodes.map((n) => ({ id: n.id, tokens: nodeTokens(n, plan) }));
  const firstMention = new Map<string, number>();
  let matchedSteps = 0;

  steps.forEach((step, index) => {
    const st = stepTokens(step);
    let matchedThisStep = false;
    for (const { id, tokens } of nodeTok) {
      if (firstMention.has(id)) {
        // Already arrived — still counts toward step-match quality.
        for (const t of tokens) {
          if (st.has(t)) {
            matchedThisStep = true;
            break;
          }
        }
        continue;
      }
      for (const t of tokens) {
        if (st.has(t)) {
          firstMention.set(id, index);
          matchedThisStep = true;
          break;
        }
      }
    }
    if (matchedThisStep) matchedSteps++;
  });

  // Guard: weak matching → do not trust the derivation.
  if (matchedSteps / steps.length < 0.6) return null;

  const presentByStep = new Map<number, Set<string>>();
  const arrivedByStep = new Map<number, Set<string>>();
  const present = new Set<string>();

  // Nodes never mentioned anywhere: structural/background — always present
  // (hiding them would wrongly amputate the product).
  for (const { id } of nodeTok) {
    if (!firstMention.has(id)) present.add(id);
  }

  steps.forEach((_, index) => {
    const arrived = new Set<string>();
    for (const [id, at] of firstMention) {
      if (at === index) {
        present.add(id);
        arrived.add(id);
      }
    }
    presentByStep.set(index, new Set(present));
    arrivedByStep.set(index, arrived);
  });

  return { presentByStep, arrivedByStep };
}

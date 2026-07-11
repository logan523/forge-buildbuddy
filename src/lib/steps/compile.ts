/**
 * Instruction compiler — derives per-step wiring facts from the electrical
 * netlist so the screen renders TRUTH-CONSISTENT connections instead of
 * LLM prose. (Consistency, not physical correctness: for generated plans the
 * netlist itself is LLM output, checked by ERC; the demo's is hand-verified.)
 *
 *   plan.electrical (netlist) ──► edges (2-member = "consistent",
 *          │                       3+-member star from hub = "derived")
 *          │  colors via THE authority (wire-colors.ts)
 *          ▼
 *   token-score wiring steps ──► step.compiled {connections, checks}
 *          │                          + multimeter checks from domainV
 *          ▼
 *   unmatched edges ──► plan.compiledFacts.unassigned (NEVER dropped)
 *
 * Silkscreen labels only — no physical pin positions (vendor pin order
 * varies across commodity modules; "leftmost pin" can reverse power).
 * Defensive throughout: malformed nets are skipped, never thrown.
 */

import type {
  BuildPlan,
  BuildStep,
  CompiledConnection,
  CompiledCheck,
  CompiledStepFacts,
} from "@/lib/types";
import type { ElectricalModel, ElectricalNet } from "@/lib/electrical/types";
import { netColorFor, wireColorName } from "@/lib/wire-colors";
import { domainForNet } from "@/lib/electrical/voltage-domains";
import { pickHub } from "@/lib/electrical/hub";
import { stepKind } from "./classify";
import { buildMicroSteps } from "./micro-steps";

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "module", "board", "sensor", "switch", "cell",
  "battery", "panel", "wire", "wires",
]);

function shortLabel(name: string): string {
  return name.split(" ").slice(0, 3).join(" ");
}

function stepBlob(step: BuildStep): string {
  const actions = (step.actions || []).map((a) => a.text).join(" ");
  return `${step.title || ""} ${step.description || ""} ${step.quickSummary || ""} ${step.goal || ""} ${actions}`.toLowerCase();
}

function wireColorByNetName(plan: BuildPlan): Map<string, string> {
  const map = new Map<string, string>();
  for (const n of plan.structuredNets || []) {
    if (n.wireColor) map.set(n.name.toLowerCase(), n.wireColor);
  }
  return map;
}


/** Build the full connection list from the netlist. Skips malformed nets. */
export function edgesFromModel(plan: BuildPlan, model: ElectricalModel): CompiledConnection[] {
  const edges: CompiledConnection[] = [];
  const nameByRef = new Map(model.components.map((c) => [c.ref, shortLabel(c.name)]));
  const planColors = wireColorByNetName(plan);

  for (const net of model.nets || []) {
    try {
      const members = (net.members || []).filter((m) => m?.ref && m?.pin);
      if (members.length < 2) continue;
      const wireColor =
        planColors.get(net.name.toLowerCase()) ??
        (net as ElectricalNet & { wireColor?: string }).wireColor;
      const colorHex = netColorFor(net.netClass, wireColor, net.name);
      const colorName = wireColorName(colorHex);
      const grade: CompiledConnection["grade"] = members.length === 2 ? "consistent" : "derived";
      const domain = domainForNet(net);
      const hub = members.length === 2 ? members[0] : pickHub(members);
      for (const m of members) {
        if (m === hub) continue;
        edges.push({
          id: `${net.name}:${m.ref}:${m.pin}`,
          netName: net.name,
          netClass: net.netClass,
          fromRef: hub.ref,
          fromPin: hub.pin,
          fromLabel: nameByRef.get(hub.ref) || hub.ref,
          toRef: m.ref,
          toPin: m.pin,
          toLabel: nameByRef.get(m.ref) || m.ref,
          colorHex,
          colorName,
          grade,
          domainKey: domain.key,
          domainLabel: domain.label,
          domainColorHex: domain.colorHex,
          domainVolts: domain.volts,
        });
      }
    } catch {
      // Malformed net — skip; the plan must still load (F1).
    }
  }
  return edges;
}

function edgeTokens(edge: CompiledConnection): { token: string; weight: number }[] {
  const tokens: { token: string; weight: number }[] = [];
  const push = (token: string, weight: number) => {
    const t = token.toLowerCase().trim();
    if (t.length >= 2 && !STOP_WORDS.has(t)) tokens.push({ token: t, weight });
  };
  push(edge.fromPin, 2);
  push(edge.toPin, 2);
  push(edge.netName, 2);
  push(edge.colorName, 1);
  for (const label of [edge.fromLabel, edge.toLabel]) {
    for (const w of label.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && !STOP_WORDS.has(w)) push(w, 1);
    }
  }
  return tokens;
}

function scoreEdgeAgainst(blob: string, edge: CompiledConnection): number {
  let score = 0;
  for (const { token, weight } of edgeTokens(edge)) {
    if (blob.includes(token)) score += weight;
  }
  return score;
}

interface Assignment {
  byStep: Map<number, CompiledConnection[]>;
  unassigned: CompiledConnection[];
}

/**
 * A "prepare/desolder" step makes NO net connections — you're removing a header
 * or prepping a module, not wiring a net. The classifier can still label these
 * "wiring" (they mention "solder"), but they must not absorb connection legs,
 * or a desolder step ends up telling you to "solder the black wire." Keep them
 * out of the candidate pool so the connections land on the real wiring step.
 */
function isPrepStep(step: BuildStep): boolean {
  return /\b(prepare|desolder|de-solder)\b|\bremove the .*(header|pins?)\b/i.test(step.title || "");
}

/** Assign each edge to its best-matching wiring step; ties → earliest step. */
export function assignEdges(steps: BuildStep[], edges: CompiledConnection[]): Assignment {
  const wiringSteps = steps.filter((s) => stepKind(s) === "wiring" && !isPrepStep(s));
  const blobs = new Map(wiringSteps.map((s) => [s.stepNumber, stepBlob(s)]));
  const byStep = new Map<number, CompiledConnection[]>();
  const unassigned: CompiledConnection[] = [];

  for (const edge of edges) {
    let best: { stepNumber: number; score: number } | null = null;
    for (const s of wiringSteps) {
      const score = scoreEdgeAgainst(blobs.get(s.stepNumber)!, edge);
      if (score > 0 && (!best || score > best.score)) {
        best = { stepNumber: s.stepNumber, score };
      }
    }
    if (best) {
      const list = byStep.get(best.stepNumber) || [];
      list.push(edge);
      byStep.set(best.stepNumber, list);
    } else {
      unassigned.push(edge);
    }
  }
  return { byStep, unassigned };
}

/** Multimeter expectations from net voltage domains — one per powered device. */
export function checksFor(
  connections: CompiledConnection[],
  model: ElectricalModel
): CompiledCheck[] {
  const checks: CompiledCheck[] = [];
  const seen = new Set<string>();
  const netByName = new Map(model.nets.map((n) => [n.name, n]));

  for (const conn of connections) {
    if (conn.netClass !== "power") continue;
    if (seen.has(conn.toRef)) continue;
    const net = netByName.get(conn.netName);
    const v = net?.members?.find((m) => typeof m.domainV === "number")?.domainV;
    if (typeof v !== "number") continue;
    seen.add(conn.toRef);
    const expected =
      v > 3.5 && v <= 4.3
        ? "3.6–4.2 V (charged Li-ion)"
        : `${(v - 0.1).toFixed(1)}–${(v + 0.1).toFixed(1)} V`;
    checks.push({
      kind: "multimeter",
      instruction: `Multimeter (DC volts) across ${conn.toLabel}: ${conn.toPin} ↔ GND`,
      expected,
    });
  }
  return checks;
}

/**
 * Plan part ids a step's connections touch, resolved via the electrical
 * model's ref→partId map. Deterministic structured focus for the 3D camera —
 * replaces the title-regex guessing that framed unrelated parts.
 */
export function focusPartIdsFor(
  connections: CompiledConnection[],
  refToPartId: Map<string, string>
): string[] {
  // Shared power/ground rails fan out from the MCU hub to nearly every part,
  // so a step that mentions the MCU would otherwise "focus" the whole board.
  // A step's signal/data nets are its real visual subject; fall back to all
  // connections only when a step is purely power/ground (e.g. battery wiring).
  const RAIL = /^(gnd|ground|power)$/i;
  const signal = connections.filter((c) => !RAIL.test(c.netClass));
  const use = signal.length ? signal : connections;

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const c of use) {
    for (const ref of [c.fromRef, c.toRef]) {
      const partId = refToPartId.get(ref);
      if (partId && !seen.has(partId)) {
        seen.add(partId);
        ids.push(partId);
      }
    }
  }
  return ids;
}

/**
 * Attach derived facts to every step + plan-level status. Never throws —
 * a compiler failure degrades to status "failed" (banner, diagnostics),
 * and the plan still loads (eng F1).
 */
export function attachCompiledFacts(plan: BuildPlan): BuildPlan {
  const model = plan.electrical;
  if (!model) {
    return { ...plan, compiledFacts: { status: "unavailable", unassigned: [], issues: [] } };
  }
  const edges = edgesFromModel(plan, model);
  const { byStep, unassigned } = assignEdges(plan.steps || [], edges);
  const refToPartId = new Map(model.components.map((c) => [c.ref, c.partId]));

  const steps = (plan.steps || []).map((s): BuildStep => {
    const connections = byStep.get(s.stepNumber);
    if (!connections?.length) {
      // Keep steps clean of empty derived objects.
      if (s.compiled) {
        const { compiled: _drop, ...rest } = s;
        return rest;
      }
      return s;
    }
    const focusPartIds = focusPartIdsFor(connections, refToPartId);
    const checks = checksFor(connections, model);
    const compiled: CompiledStepFacts = {
      connections,
      checks,
      microSteps: buildMicroSteps(connections, checks, refToPartId),
      ...(focusPartIds.length ? { focusPartIds } : {}),
    };
    return { ...s, compiled };
  });

  return {
    ...plan,
    steps,
    compiledFacts: { status: "ok", unassigned, issues: [] },
  };
}

/**
 * Strip derived data before share/persist (eng 1A) — it is recomputed on
 * every load by applyTrustPipeline, and share URLs are already ~61KB.
 */
export function stripDerived(plan: BuildPlan): BuildPlan {
  const steps = (plan.steps || []).map((s) => {
    if (!s.compiled) return s;
    const { compiled: _drop, ...rest } = s;
    return rest;
  });
  const { compiledFacts: _dropFacts, ...rest } = plan;
  return { ...rest, steps };
}

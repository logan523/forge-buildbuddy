/**
 * The Conformance Ledger — the honesty engine made PROVABLE.
 *
 * Forge's whole promise is that the picture is derived from the netlist, never
 * drawn by an LLM. This makes that checkable: a bijection audit between what the
 * screen renders (the compiled connections) and the ERC-verified electrical
 * model. Every rendered wire must trace to a real net; every net's members must
 * be rendered. When it's 100%, a "Render fidelity: traced" seal earns the
 * technician's trust in the screen over prose. When it isn't, a precise list —
 * "wire OLED_VCC is decorative (no backing net)", "net SYS_GND has 4 members,
 * only 2 rendered" — so nothing hides.
 *
 * Pure (plan in, report out). Cheap enough to run on every load and to gate in
 * CI, so a hand-authored teaching wire or a dropped net leg can never sneak past.
 */

import type { BuildPlan, CompiledConnection } from "@/lib/types";

export interface ConformanceIssue {
  kind: "decorative" | "orphan-net" | "under-rendered";
  detail: string;
  netName: string;
}

export interface ConformanceReport {
  /** Was conformance checkable at all? (false when there's no electrical model.) */
  available: boolean;
  /** True only when every renderable net is fully rendered and nothing is decorative. */
  traced: boolean;
  /** Percent of renderable nets fully represented on screen (0–100). */
  pct: number;
  renderableNets: number;
  coveredNets: number;
  decorativeCount: number;
  issues: ConformanceIssue[];
}

const lc = (s: string) => s.toLowerCase().trim();

/** Every wire the app renders: each step's compiled connections + the never-dropped unassigned. */
function renderedConnections(plan: BuildPlan): CompiledConnection[] {
  const fromSteps = (plan.steps || []).flatMap((s) => s.compiled?.connections ?? []);
  const unassigned = plan.compiledFacts?.unassigned ?? [];
  return [...fromSteps, ...unassigned];
}

export function auditConformance(plan: BuildPlan): ConformanceReport {
  const model = plan.electrical;
  if (!model || !model.nets?.length) {
    return {
      available: false,
      traced: false,
      pct: 0,
      renderableNets: 0,
      coveredNets: 0,
      decorativeCount: 0,
      issues: [],
    };
  }

  const rendered = renderedConnections(plan);
  const netNames = new Set(model.nets.map((n) => lc(n.name)));

  const issues: ConformanceIssue[] = [];

  // 1) Decorative wires: rendered, but no net backs them.
  const decorative = rendered.filter((c) => !netNames.has(lc(c.netName)));
  for (const c of dedupeByNet(decorative)) {
    issues.push({
      kind: "decorative",
      netName: c.netName,
      detail: `wire "${c.netName}" (${c.fromLabel} → ${c.toLabel}) is decorative — no backing net in the verified model`,
    });
  }

  // 2) Coverage: each net with ≥2 members implies (members−1) rendered legs.
  const renderable = model.nets.filter((n) => (n.members?.length ?? 0) >= 2);
  const renderedByNet = new Map<string, number>();
  for (const c of rendered) renderedByNet.set(lc(c.netName), (renderedByNet.get(lc(c.netName)) ?? 0) + 1);

  let coveredNets = 0;
  for (const net of renderable) {
    const expected = (net.members?.length ?? 0) - 1;
    const got = renderedByNet.get(lc(net.name)) ?? 0;
    if (got >= expected && expected > 0) {
      coveredNets++;
    } else if (got === 0) {
      issues.push({
        kind: "orphan-net",
        netName: net.name,
        detail: `net "${net.name}" connects ${net.members!.length} pins but no wire for it is rendered`,
      });
    } else {
      issues.push({
        kind: "under-rendered",
        netName: net.name,
        detail: `net "${net.name}" has ${net.members!.length} members but only ${got} of ${expected} legs are rendered`,
      });
    }
  }

  const pct = renderable.length ? Math.round((coveredNets / renderable.length) * 100) : 100;
  const traced = pct === 100 && decorative.length === 0;

  return {
    available: true,
    traced,
    pct,
    renderableNets: renderable.length,
    coveredNets,
    decorativeCount: dedupeByNet(decorative).length,
    issues,
  };
}

function dedupeByNet(conns: CompiledConnection[]): CompiledConnection[] {
  const seen = new Set<string>();
  const out: CompiledConnection[] = [];
  for (const c of conns) {
    if (!seen.has(lc(c.netName))) {
      seen.add(lc(c.netName));
      out.push(c);
    }
  }
  return out;
}

/**
 * Step-content validator — catches prose that fights the derived truth.
 *
 * Channel discipline (eng Tension A): coverage/pin/color findings are
 * INSTRUCTION-QUALITY warnings surfaced in the coverage channel
 * (plan.compiledFacts.issues) — never the red safety banner. Only genuine
 * safety contradictions (e.g. telling a beginner to strip a Li-ion cell's
 * wrap) become safety findings.
 */

import type {
  BuildPlan,
  BuildStep,
  SafetyFinding,
  StepContentIssue,
} from "@/lib/types";
import { WIRE_NAME_HEX, colorConflict, netColorFor, wireColorName } from "@/lib/wire-colors";

const COLOR_WORDS = Object.keys(WIRE_NAME_HEX).filter((c) => c !== "gray");

function stepText(step: BuildStep): string {
  const actions = (step.actions || []).map((a) => `${a.text} ${a.caution || ""}`).join(" ");
  return `${step.title || ""} ${step.description || ""} ${step.quickSummary || ""} ${actions}`.toLowerCase();
}

function knownPinTokens(plan: BuildPlan): Set<string> {
  const known = new Set<string>();
  for (const c of plan.electrical?.components || []) {
    for (const p of c.pins || []) known.add(String(p.name ?? "").toLowerCase());
  }
  for (const n of plan.electrical?.nets || []) {
    for (const m of n.members || []) known.add(String(m.pin ?? "").toLowerCase());
  }
  known.delete("");
  return known;
}

function findUnknownPins(plan: BuildPlan): StepContentIssue[] {
  const known = knownPinTokens(plan);
  if (known.size === 0) return [];
  const issues: StepContentIssue[] = [];

  for (const s of plan.steps || []) {
    const text = stepText(s);
    const claims = new Set<string>();
    for (const m of text.matchAll(/\bgpio\s?(\d+)\b/g)) claims.add(`gpio${m[1]}`);
    // "pin 2" style physical-position claims — vendor pin order varies, so a
    // bare number that isn't a silkscreen label is unverifiable.
    for (const m of text.matchAll(/\bpin\s+(\d+)\b/g)) claims.add(m[1]);

    for (const claim of claims) {
      if (known.has(claim)) continue;
      if (/^\d+$/.test(claim) && known.has(`gpio${claim}`)) continue;
      issues.push({
        id: "STEP_UNKNOWN_PIN",
        severity: "warning",
        stepNumber: s.stepNumber,
        detail: `Step ${s.stepNumber} names pin "${claim}" which is not a silkscreen label in this plan's netlist — physical pin positions vary by vendor.`,
      });
    }
  }
  return issues;
}

function findColorMismatches(plan: BuildPlan): StepContentIssue[] {
  const issues: StepContentIssue[] = [];
  for (const s of plan.steps || []) {
    if (!s.compiled?.connections?.length) continue;
    const text = stepText(s);
    const allowed = new Set(s.compiled.connections.map((c) => c.colorName));
    for (const color of COLOR_WORDS) {
      if (allowed.has(color)) continue;
      // Only flag color words tied directly to a wire — "black probe on −"
      // and "plan black for −" are prose, not wire instructions.
      const wireContext = new RegExp(
        `\\b${color}\\s+(wire|wires)\\b|\\b(wire|wires)[^.,]{0,12}\\b${color}\\b|${color}=`
      );
      if (wireContext.test(text)) {
        issues.push({
          id: "STEP_COLOR_MISMATCH",
          severity: "warning",
          stepNumber: s.stepNumber,
          detail: `Step ${s.stepNumber} tells the builder to use a ${color} wire, but none of its derived connections are ${color} — the views would disagree with the text.`,
        });
      }
    }
  }
  return issues;
}

const WRAP_REMOVAL = /\b(peel|remove|strip|score)\b[^.]{0,80}\b(casing|shrink[-\s]?wrap|wrap|sleeve|insulation)\b/;

function planHasLithium(plan: BuildPlan): boolean {
  if (plan.electrical?.components?.some((c) => c.isLithiumCell)) return true;
  return (plan.parts || []).some((p) => /16340|18650|14500|li-?ion|lipo|lithium/i.test(p.name || ""));
}

function findSafetyContradictions(plan: BuildPlan): StepContentIssue[] {
  if (!planHasLithium(plan)) return [];
  const issues: StepContentIssue[] = [];
  for (const s of plan.steps || []) {
    const text = stepText(s);
    if (!/batter|cell|16340|18650|li-?ion/.test(text)) continue;
    if (WRAP_REMOVAL.test(text)) {
      issues.push({
        id: "STEP_SAFETY_CONTRADICTION",
        severity: "error",
        stepNumber: s.stepNumber,
        detail: `Step ${s.stepNumber} instructs removing the cell's wrap/casing — on a Li-ion cell the wrap is the insulation against dead shorts. Rewrite to keep protection intact.`,
      });
    }
  }
  return issues;
}

function findUncoveredNets(plan: BuildPlan): StepContentIssue[] {
  const unassigned = plan.compiledFacts?.unassigned || [];
  if (unassigned.length === 0) return [];
  const nets = [...new Set(unassigned.map((e) => e.netName))];
  return [
    {
      id: "STEP_NET_UNCOVERED",
      severity: "warning",
      detail: `${nets.length} net(s) are not mentioned by any wiring step: ${nets.join(", ")}. They render in the plan-level connections panel instead.`,
    },
  ];
}

function findDataColorConflicts(plan: BuildPlan): StepContentIssue[] {
  const issues: StepContentIssue[] = [];
  for (const net of plan.structuredNets || []) {
    const netClass = net.netClass || "other";
    if (colorConflict(netClass, net.wireColor, net.name)) {
      const authority = wireColorName(netColorFor(netClass, undefined, net.name));
      issues.push({
        id: "STEP_COLOR_MISMATCH",
        severity: "warning",
        detail: `Net ${net.name} declares wireColor "${net.wireColor}" but its class (${netClass}) renders ${authority} everywhere — the plan color is overridden (V5 precedence).`,
      });
    }
  }
  return issues;
}

export function validateStepContent(plan: BuildPlan): StepContentIssue[] {
  return [
    ...findSafetyContradictions(plan),
    ...findUnknownPins(plan),
    ...findColorMismatches(plan),
    ...findDataColorConflicts(plan),
    ...findUncoveredNets(plan),
  ];
}

/** Only genuine hazards cross into the safety channel (Tension A). */
export function stepIssuesToSafetyFindings(issues: StepContentIssue[]): SafetyFinding[] {
  return issues
    .filter((i) => i.id === "STEP_SAFETY_CONTRADICTION")
    .map((i) => ({
      id: `step-safety-${i.stepNumber ?? "plan"}`,
      severity: "critical" as const,
      title: "Step instruction contradicts battery safety",
      detail: i.detail,
      mitigation: "Keep the cell's protective wrap intact; solder only to tabs or scuffed terminal tips.",
    }));
}

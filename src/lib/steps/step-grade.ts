/**
 * Step content grader — the LLM half of the step-review loop. For each step it
 * asks: could a COMPLETE beginner follow this without getting stuck? It grades
 * the instruction prose AGAINST the same compiled facts the screen shows, so it
 * catches vagueness, undefined jargon, and — critically — prose that contradicts
 * or omits the derived connection truth.
 *
 * Pure (prompt + parser + DI handler), same shape as photo-check.ts, so the
 * grader script and the contract tests share one implementation. It flags for a
 * human; it never edits. Bias: when unsure, flag (a false "5" sends a beginner
 * into a step with no help).
 */

import type { BuildPlan, BuildStep } from "@/lib/types";

export interface StepGrade {
  stepNumber: number;
  /** 1 = a beginner is lost; 5 = zero confusion. 0 = grader output unparseable. */
  score: number;
  issues: string[];
}

export const STEP_GRADE_SYSTEM = `You audit ONE step of a DIY electronics build for a COMPLETE beginner — someone who does not know what a pull-up resistor is, or I2C from SPI. They need exact pins, wire colors, and unambiguous actions.

Respond with ONLY a JSON object: {"score": <1-5>, "issues": ["...", ...]}

score:
- 5 — a total beginner could do this with zero confusion.
- 3 — doable but with a guess or a moment of "wait, which one?".
- 1 — vague, contradictory, or missing information a beginner needs to act.

Flag as an issue (each a short, specific phrase):
- Jargon used without a plain-English gloss.
- A pin, wire color, or count the prose leaves ambiguous when it matters.
- Prose that DISAGREES with the DERIVED CONNECTIONS (wrong pin/color/part) — the derived facts are ground truth; the prose must not contradict them.
- A connection in the derived facts that the prose never tells the builder to make.
- An action that assumes unstated knowledge or a skipped sub-step.

Rules:
- Judge ONLY this step against the facts given. Do not invent pins or colors.
- Bias toward flagging. A false "5" is worse than an over-cautious "3".
- Output the JSON object only — no markdown, no prose around it.`;

export function buildStepGradeUser(plan: BuildPlan, step: BuildStep): string {
  const actions = (step.actions || []).slice(0, 12).map((a, i) => `${i + 1}. ${a.text}`);
  const connections = (step.compiled?.connections || [])
    .slice(0, 40)
    .map(
      (c) =>
        `${c.colorName} wire: ${c.fromLabel} pin ${c.fromPin} → ${c.toLabel} pin ${c.toPin} (net ${c.netName})`
    );
  const checks = (step.compiled?.checks || [])
    .slice(0, 10)
    .map((c) => `${c.instruction} → ${c.expected}`);

  return [
    `STEP ${step.stepNumber}: ${step.title}`,
    step.goal ? `GOAL: ${step.goal}` : "",
    step.quickSummary ? `SUMMARY: ${step.quickSummary}` : "",
    actions.length ? `ACTIONS THE BUILDER SEES:\n${actions.join("\n")}` : "ACTIONS: none listed.",
    connections.length
      ? `DERIVED CONNECTIONS (ground truth — prose must agree with these):\n${connections.join("\n")}`
      : "DERIVED CONNECTIONS: none for this step.",
    checks.length ? `CHECKS:\n${checks.join("\n")}` : "",
    (step.safetyNotes || []).length ? `SAFETY: ${(step.safetyNotes || []).join(" | ")}` : "",
    `Grade this step and return the JSON verdict.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Abstain-to-flag parser: unparseable or out-of-range output → score 0 (needs review). */
export function parseStepGrade(stepNumber: number, text: string): StepGrade {
  const match = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!match) return { stepNumber, score: 0, issues: ["grader output could not be parsed — review manually"] };
  try {
    const obj = JSON.parse(match[0]) as { score?: unknown; issues?: unknown };
    const raw = typeof obj.score === "number" ? obj.score : Number(obj.score);
    const score = Number.isFinite(raw) ? Math.max(1, Math.min(5, Math.round(raw))) : 0;
    const issues = Array.isArray(obj.issues)
      ? obj.issues.filter((s): s is string => typeof s === "string").slice(0, 12)
      : [];
    if (score === 0) return { stepNumber, score: 0, issues: ["grader returned no usable score — review manually"] };
    return { stepNumber, score, issues };
  } catch {
    return { stepNumber, score: 0, issues: ["grader output could not be parsed — review manually"] };
  }
}

/** Grade every step of a plan. DI'd completion fn so tests/scripts run without the SDK. */
export async function gradePlanSteps(
  plan: BuildPlan,
  complete: (system: string, user: string) => Promise<string>
): Promise<StepGrade[]> {
  const grades: StepGrade[] = [];
  for (const step of plan.steps || []) {
    try {
      const text = await complete(STEP_GRADE_SYSTEM, buildStepGradeUser(plan, step));
      grades.push(parseStepGrade(step.stepNumber, text));
    } catch {
      grades.push({ stepNumber: step.stepNumber, score: 0, issues: ["grader call failed — review manually"] });
    }
  }
  return grades;
}

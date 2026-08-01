/**
 * Step review loop — the recursive QA module.
 *
 * Runs two graders over a plan's steps and prints ONE ranked report, worst
 * first, so a human reviews only what's flagged instead of eyeballing every
 * step of every plan:
 *
 *   1. Render audit (deterministic, always runs) — catches the black-stage /
 *      wrong-focus / camera-nowhere class mechanically.
 *   2. Content grade (LLM, runs when ANTHROPIC_API_KEY is set) — "could a
 *      beginner follow this?", graded against the compiled connection facts.
 *
 * Usage:
 *   npx tsx scripts/grade-steps.mjs                 # the demo plan
 *   npx tsx scripts/grade-steps.mjs path/to/plan.json
 *
 * Recursive-learning hook: when you adjudicate a flag ("this step is actually
 * fine"), encode it as a golden in step-render-audit.test.ts (structural) or as
 * a fixture note (content). The grader then never re-flags it, and a regression
 * that reintroduces it fails the test. Your taste gets encoded once.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { applyTrustPipeline } from "../src/lib/trust.ts";
import { auditPlanRender } from "../src/lib/product-3d/step-render-audit.ts";
import {
  STEP_GRADE_SYSTEM,
  buildStepGradeUser,
  parseStepGrade,
} from "../src/lib/steps/step-grade.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "src", "data", "sat-line.json");

const raw = JSON.parse(readFileSync(planPath, "utf8"));
const plan = applyTrustPipeline(raw);
const steps = plan.steps || [];
console.log(`\nReviewing "${plan.title || plan.id}" — ${steps.length} steps\n`);

// --- 1. Deterministic render audit ---
const renderFindings = auditPlanRender(plan);

// --- 2. LLM content grade (optional) ---
const grades = new Map();
if (process.env.ANTHROPIC_API_KEY) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  process.stdout.write("Grading step content");
  for (const step of steps) {
    let text = "";
    try {
      const res = await client.messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          temperature: 0,
          system: STEP_GRADE_SYSTEM,
          messages: [{ role: "user", content: buildStepGradeUser(plan, step) }],
        },
        { timeout: 30_000 }
      );
      const c = res.content[0];
      text = c?.type === "text" ? c.text : "";
    } catch (e) {
      text = "";
    }
    grades.set(step.stepNumber, parseStepGrade(step.stepNumber, text));
    process.stdout.write(".");
  }
  console.log("\n");
} else {
  console.log("(ANTHROPIC_API_KEY not set — running the render audit only; set it for content grading.)\n");
}

// --- Merge + rank worst-first ---
const rows = steps.map((s) => {
  const render = renderFindings.filter((f) => f.stepNumber === s.stepNumber);
  const grade = grades.get(s.stepNumber);
  const errorCount = render.filter((f) => f.severity === "error").length;
  // Rank key: render errors dominate, then low content scores, then warnings.
  const rank = errorCount * 100 + (grade && grade.score > 0 ? 5 - grade.score : grade ? 6 : 0) * 4 + render.length;
  return { s, render, grade, errorCount, rank };
});
rows.sort((a, b) => b.rank - a.rank);

let flagged = 0;
for (const { s, render, grade, errorCount } of rows) {
  const problems = render.length > 0 || (grade && (grade.score === 0 || grade.score <= 3));
  if (!problems) continue;
  flagged++;
  const tag = errorCount > 0 ? "✗ ERROR" : "⚠ REVIEW";
  const scoreStr = grade ? (grade.score === 0 ? "score ?" : `score ${grade.score}/5`) : "";
  console.log(`${tag}  Step ${s.stepNumber}: ${s.title}  ${scoreStr}`);
  for (const f of render) console.log(`        [3D ${f.severity}] ${f.code}: ${f.detail}`);
  for (const issue of grade?.issues || []) console.log(`        [content] ${issue}`);
  console.log("");
}

const cleanCount = steps.length - flagged;
console.log(`— ${flagged} step(s) flagged for review, ${cleanCount} clean.`);
if (flagged === 0) console.log("  Nothing to look at — every step passed both graders.");
else console.log("  Review only the flagged steps above; adjudicated ones become goldens.");

// Ship gate (P0.4): deterministic render ERRORS fail the process so CI / npm
// run audit:steps never green-lights a black stage or phantom focus. Content
// grades and render WARNINGs stay advisory (exit 0) — they need human taste.
const renderErrors = renderFindings.filter((f) => f.severity === "error");
if (renderErrors.length > 0) {
  console.error(
    `\nSHIP GATE FAIL: ${renderErrors.length} render error(s). Fix focus/presence before shipping.`
  );
  process.exit(1);
}
process.exit(0);

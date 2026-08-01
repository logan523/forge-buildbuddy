/**
 * Task explorer ship gate — runs offline T01–T06 on the demo plan.
 * Exit 1 if any task fails.
 *
 *   npm run audit:tasks
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyTrustPipeline } from "../src/lib/trust.ts";
import { runAllOfflineTasks } from "../src/lib/tasks/run.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const planPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "src", "data", "sat-line.json");

const raw = JSON.parse(readFileSync(planPath, "utf8"));
const plan = applyTrustPipeline(raw);
const reports = runAllOfflineTasks(plan);

console.log(`\nTask explorer — "${plan.title || plan.id}"\n`);
let failed = 0;
for (const r of reports) {
  const tag = r.pass ? "✓ PASS" : "✗ FAIL";
  console.log(`${tag}  ${r.taskId}  ${r.title}`);
  for (const c of r.checks) {
    console.log(`        ${c.pass ? "·" : "x"} ${c.id}: ${c.detail}`);
  }
  if (!r.pass) failed++;
  console.log("");
}

if (failed > 0) {
  console.error(`SHIP GATE FAIL: ${failed} task(s) failed.`);
  process.exit(1);
}
console.log(`All ${reports.length} offline tasks passed.`);
process.exit(0);

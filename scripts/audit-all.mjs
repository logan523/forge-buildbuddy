/**
 * Unified ship gate: render audit + task explorer + classroom task subset.
 *
 *   npm run audit:all
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args) {
  console.log(`\n══ ${label} ══\n`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`\nFAIL: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

run("Step render audit", "npx", ["tsx", "scripts/grade-steps.mjs"]);
run("Task explorer", "npx", ["tsx", "scripts/audit-tasks.mjs"]);
run("Classroom export (gates tasks)", "npx", ["tsx", "scripts/export-classroom.mjs"]);

console.log("\n══ ALL GATES GREEN ══\n");
process.exit(0);

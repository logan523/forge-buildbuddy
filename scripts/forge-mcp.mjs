/**
 * Minimal Forge MCP CLI — invoke offline tools against a plan JSON.
 *
 *   npx tsx scripts/forge-mcp.mjs list_tools
 *   npx tsx scripts/forge-mcp.mjs audit_plan
 *   npx tsx scripts/forge-mcp.mjs run_tasks
 *   npx tsx scripts/forge-mcp.mjs get_step_facts --step 6
 *   npx tsx scripts/forge-mcp.mjs match_skills --step 6
 *
 * Exit 1 on tool failure. For full MCP stdio protocol, wrap invokeForgeTool
 * in an MCP server host (Claude/Cursor) — this script is the smoke surface.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { invokeForgeTool } from "../src/lib/mcp/handlers.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const tool = args[0] || "list_tools";

function flag(name) {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  return args[i + 1];
}

const planPath = flag("--plan") || path.join(ROOT, "src", "data", "sat-line.json");
const plan = tool === "list_tools" ? undefined : JSON.parse(readFileSync(planPath, "utf8"));
const step = flag("--step");

const result = invokeForgeTool(tool, {
  plan,
  stepNumber: step != null ? Number(step) : undefined,
  allStepsComplete: args.includes("--all-complete"),
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

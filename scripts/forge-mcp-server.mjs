/**
 * Forge MCP server — JSON-RPC 2.0 over stdio (newline-delimited).
 *
 * Claude Code:
 *   claude mcp add --transport stdio forge -- npx tsx /path/to/buildbuddy/scripts/forge-mcp-server.mjs
 *
 * Optional:
 *   FORGE_PLAN=/path/to/plan.json   default BuildPlan for tools that need one
 *   FORGE_PLAN defaults to src/data/sat-line.json
 *
 * Logs go to stderr; stdout is reserved for JSON-RPC.
 */

import { createInterface } from "node:readline";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleMcpMessage, parseMcpLine } from "../src/lib/mcp/protocol.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPlanPath =
  process.env.FORGE_PLAN || path.join(ROOT, "src", "data", "sat-line.json");

function loadPlanFile(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!existsSync(abs)) throw new Error(`plan not found: ${abs}`);
  return JSON.parse(readFileSync(abs, "utf8"));
}

let defaultPlan;
try {
  defaultPlan = loadPlanFile(defaultPlanPath);
  console.error(`[forge-mcp] default plan: ${defaultPlanPath}`);
} catch (e) {
  console.error(`[forge-mcp] no default plan (${e.message}) — pass plan in tool args`);
  defaultPlan = undefined;
}

const ctx = {
  defaultPlan,
  loadPlanPath: (p) => loadPlanFile(p),
};

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  const msg = parseMcpLine(line);
  if (!msg) return;
  try {
    const res = handleMcpMessage(msg, ctx);
    if (res) {
      process.stdout.write(JSON.stringify(res) + "\n");
    }
  } catch (e) {
    const id = msg.id !== undefined ? msg.id : null;
    process.stdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: String(e?.message || e) },
      }) + "\n"
    );
  }
});

rl.on("close", () => process.exit(0));

console.error("[forge-mcp] ready (stdio JSON-RPC, tools/list · tools/call)");

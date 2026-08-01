/**
 * HTTP surface for Forge MCP tools (P2).
 *
 * POST /api/mcp
 *   { "tool": "audit_plan", "arguments": { "plan": { ... } } }
 *   { "method": "tools/list" }
 *   { "method": "tools/call", "params": { "name": "audit_plan", "arguments": {} } }
 *
 * Without a plan in arguments, the server loads the demo Sat Line plan
 * (same default as stdio). Live tools return live-required.
 *
 * Not full MCP Streamable HTTP — a simple JSON API agents/scripts can call.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { checkApiGuards, clientIp } from "@/lib/api-guards";
import { invokeForgeTool } from "@/lib/mcp/handlers";
import { handleMcpMessage } from "@/lib/mcp/protocol";
import { mcpToolDescriptors } from "@/lib/mcp/tool-schemas";
import { listForgeResources } from "@/lib/mcp/resources";
import type { BuildPlan } from "@/lib/types";

export const runtime = "nodejs";

function demoPlan(): BuildPlan {
  const p = path.join(process.cwd(), "src", "data", "sat-line.json");
  return JSON.parse(readFileSync(p, "utf8")) as BuildPlan;
}

export async function GET() {
  return NextResponse.json({
    name: "forge-buildbuddy",
    transport: "http-json",
    endpoints: {
      POST: {
        tool: "{ tool, arguments? }",
        mcp: "{ method: tools/list | tools/call | resources/list | resources/read | initialize, params? }",
      },
    },
    tools: mcpToolDescriptors().map((t) => t.name),
    resources: listForgeResources().map((r) => r.uri),
  });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = raw as Record<string, unknown>;
  const ip = clientIp(request);
  const size = JSON.stringify(raw).length;
  const guard = checkApiGuards("mcp", ip, size);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  // MCP-shaped methods
  if (typeof body.method === "string") {
    let defaultPlan: BuildPlan | undefined;
    try {
      defaultPlan = demoPlan();
    } catch {
      defaultPlan = undefined;
    }
    const res = handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: (body.id as string | number) ?? 1,
        method: body.method,
        params: body.params,
      },
      { defaultPlan }
    );
    if (!res) {
      return NextResponse.json({ ok: true, notification: true });
    }
    return NextResponse.json(res, { status: res.error ? 400 : 200 });
  }

  // Simple { tool, arguments }
  const tool = typeof body.tool === "string" ? body.tool : "";
  if (!tool) {
    return NextResponse.json(
      { error: "Provide tool + arguments, or method (tools/list | tools/call)." },
      { status: 400 }
    );
  }

  const args = (body.arguments && typeof body.arguments === "object"
    ? body.arguments
    : {}) as Record<string, unknown>;

  if (!args.plan) {
    try {
      args.plan = demoPlan();
    } catch {
      /* plan optional for list-like tools */
    }
  }

  const result = invokeForgeTool(tool, {
    plan: args.plan as BuildPlan | undefined,
    stepNumber: typeof args.stepNumber === "number" ? args.stepNumber : undefined,
    stepIndex: typeof args.stepIndex === "number" ? args.stepIndex : undefined,
    taskId: typeof args.taskId === "string" ? (args.taskId as never) : undefined,
    allStepsComplete: typeof args.allStepsComplete === "boolean" ? args.allStepsComplete : undefined,
    wiringVerify: typeof args.wiringVerify === "string" ? (args.wiringVerify as never) : undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "live-required" ? 501 : 400 });
}

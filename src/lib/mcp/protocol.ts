/**
 * Minimal MCP JSON-RPC 2.0 message handler (stdio-friendly).
 * Pure: no process I/O — scripts wire stdin/stdout.
 */

import { invokeForgeTool, type ForgeMcpArgs } from "./handlers";
import { mcpToolDescriptors } from "./tool-schemas";
import { listForgeResources, readForgeResource } from "./resources";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "forge-buildbuddy", version: "0.1.0" };

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ProtocolContext {
  /** Default plan loaded by the server (e.g. sat-line). */
  defaultPlan?: unknown;
  /** Resolve planPath → BuildPlan JSON (optional). */
  loadPlanPath?: (path: string) => unknown;
}

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

function resolveArgs(params: unknown, ctx: ProtocolContext): ForgeMcpArgs {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  // tools/call shape: { name, arguments }
  const raw =
    p.arguments && typeof p.arguments === "object"
      ? (p.arguments as Record<string, unknown>)
      : p;

  let plan = raw.plan ?? ctx.defaultPlan;
  if (!plan && typeof raw.planPath === "string" && ctx.loadPlanPath) {
    plan = ctx.loadPlanPath(raw.planPath);
  }

  return {
    plan: plan as ForgeMcpArgs["plan"],
    stepNumber: typeof raw.stepNumber === "number" ? raw.stepNumber : undefined,
    stepIndex: typeof raw.stepIndex === "number" ? raw.stepIndex : undefined,
    taskId: typeof raw.taskId === "string" ? (raw.taskId as ForgeMcpArgs["taskId"]) : undefined,
    allStepsComplete: typeof raw.allStepsComplete === "boolean" ? raw.allStepsComplete : undefined,
    wiringVerify: typeof raw.wiringVerify === "string" ? (raw.wiringVerify as ForgeMcpArgs["wiringVerify"]) : undefined,
  };
}

/**
 * Handle one JSON-RPC request. Notifications (no id) return null.
 * Unknown methods return JSON-RPC method-not-found.
 */
export function handleMcpMessage(
  msg: JsonRpcRequest,
  ctx: ProtocolContext = {}
): JsonRpcResponse | null {
  const method = msg.method || "";
  const id = msg.id !== undefined ? msg.id : null;
  const isNotification = msg.id === undefined;

  // Notifications — acknowledge by doing nothing (or initialize side-effects only).
  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }

  if (method === "initialize") {
    if (isNotification) return null;
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
      },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === "ping") {
    if (isNotification) return null;
    return ok(id, {});
  }

  if (method === "tools/list") {
    if (isNotification) return null;
    return ok(id, { tools: mcpToolDescriptors() });
  }

  if (method === "resources/list") {
    if (isNotification) return null;
    return ok(id, {
      resources: listForgeResources().map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      })),
    });
  }

  if (method === "resources/read") {
    if (isNotification) return null;
    const params = (msg.params || {}) as { uri?: string };
    const uri = params.uri;
    if (!uri) return err(id, -32602, "resources/read requires params.uri");
    const res = readForgeResource(uri);
    if (!res) return err(id, -32002, `Resource not found: ${uri}`);
    return ok(id, {
      contents: [
        {
          uri: res.uri,
          mimeType: res.mimeType,
          text: res.text,
        },
      ],
    });
  }

  if (method === "tools/call") {
    if (isNotification) return null;
    const params = (msg.params || {}) as { name?: string; arguments?: unknown };
    const name = params.name;
    if (!name || typeof name !== "string") {
      return err(id, -32602, "tools/call requires params.name");
    }
    const args = resolveArgs({ arguments: params.arguments ?? {} }, ctx);
    const result = invokeForgeTool(name, args);
    // MCP tool result content blocks
    const text = JSON.stringify(result, null, 2);
    return ok(id, {
      content: [{ type: "text", text }],
      isError: !result.ok,
      structuredContent: result,
    });
  }

  if (isNotification) return null;
  return err(id, -32601, `Method not found: ${method}`);
}

/** Parse one line of JSON; returns null on empty/invalid. */
export function parseMcpLine(line: string): JsonRpcRequest | null {
  const t = line.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as JsonRpcRequest;
  } catch {
    return null;
  }
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import satLine from "@/data/sat-line.json";
import { handleMcpMessage, parseMcpLine } from "./protocol";

const ctx = { defaultPlan: JSON.parse(JSON.stringify(satLine)) };

describe("mcp protocol", () => {
  it("initialize returns serverInfo + tools capability", () => {
    const res = handleMcpMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      ctx
    );
    assert.ok(res && !res.error);
    assert.equal((res!.result as { serverInfo: { name: string } }).serverInfo.name, "forge-buildbuddy");
  });

  it("tools/list includes audit_plan", () => {
    const res = handleMcpMessage({ id: 2, method: "tools/list" }, ctx);
    const tools = (res!.result as { tools: { name: string }[] }).tools;
    assert.ok(tools.some((t) => t.name === "audit_plan"));
  });

  it("resources/list includes wire-color authority", () => {
    const res = handleMcpMessage({ id: 20, method: "resources/list" }, ctx);
    const resources = (res!.result as { resources: { uri: string }[] }).resources;
    assert.ok(resources.some((r) => r.uri.includes("wire-color")));
  });

  it("resources/read returns markdown for pin policy", () => {
    const res = handleMcpMessage(
      { id: 21, method: "resources/read", params: { uri: "forge://pin-label-only" } },
      ctx
    );
    const contents = (res!.result as { contents: { text: string }[] }).contents;
    assert.match(contents[0]!.text, /silkscreen/i);
  });

  it("tools/call audit_plan succeeds with default plan", () => {
    const res = handleMcpMessage(
      {
        id: 3,
        method: "tools/call",
        params: { name: "audit_plan", arguments: {} },
      },
      ctx
    );
    assert.ok(res && !res.error);
    const body = res!.result as { isError: boolean; structuredContent: { ok: boolean } };
    assert.equal(body.isError, false);
    assert.equal(body.structuredContent.ok, true);
  });

  it("tools/call live tool returns isError", () => {
    const res = handleMcpMessage(
      {
        id: 4,
        method: "tools/call",
        params: { name: "flash_firmware", arguments: {} },
      },
      ctx
    );
    const body = res!.result as { isError: boolean };
    assert.equal(body.isError, true);
  });

  it("notifications return null", () => {
    assert.equal(handleMcpMessage({ method: "notifications/initialized" }, ctx), null);
  });

  it("unknown method errors", () => {
    const res = handleMcpMessage({ id: 9, method: "foo/bar" }, ctx);
    assert.ok(res?.error);
    assert.equal(res!.error!.code, -32601);
  });

  it("parseMcpLine ignores garbage", () => {
    assert.equal(parseMcpLine(""), null);
    assert.equal(parseMcpLine("not-json"), null);
    assert.equal(parseMcpLine('{"method":"ping","id":1}')?.method, "ping");
  });
});

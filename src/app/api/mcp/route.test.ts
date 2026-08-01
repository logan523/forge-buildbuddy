import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { _resetApiGuards } from "@/lib/api-guards";
import { POST, GET } from "./route";

beforeEach(() => {
  _resetApiGuards();
});

function req(body: unknown): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mcp", () => {
  it("GET lists tools", async () => {
    const res = await GET();
    const json = await res.json();
    assert.ok(Array.isArray(json.tools));
    assert.ok(json.tools.includes("audit_plan"));
  });

  it("tools/list via method", async () => {
    const res = await POST(req({ method: "tools/list", id: 1 }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.result?.tools?.length > 0);
  });

  it("tool audit_plan with default demo plan", async () => {
    const res = await POST(req({ tool: "audit_plan", arguments: {} }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
    assert.equal(json.data.table.traced, true);
  });

  it("live tool returns 501", async () => {
    const res = await POST(req({ tool: "flash_firmware", arguments: {} }));
    assert.equal(res.status, 501);
    const json = await res.json();
    assert.equal(json.ok, false);
    assert.equal(json.code, "live-required");
  });
});

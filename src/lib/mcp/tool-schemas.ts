/**
 * JSON Schema-ish descriptions for MCP tools/list.
 * Arguments always accept an optional `plan` object (BuildPlan JSON).
 */

import { FORGE_MCP_TOOLS } from "./handlers";

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const planProp = {
  plan: {
    type: "object",
    description: "Forge BuildPlan JSON (from demo sat-line or analyze). Trust pipeline runs inside the tool.",
  },
  planPath: {
    type: "string",
    description: "Optional path relative to cwd; server may load JSON if plan omitted (stdio server only).",
  },
};

const DESCRIPTIONS: Record<string, string> = {
  compile_plan: "Compile instruction facts from the electrical netlist onto each step.",
  run_erc: "Return electrical rule-check results for the plan.",
  get_step_facts: "Return compiled connections/micro-steps for one stepNumber.",
  audit_plan: "Conformance (table + 3D harness) + step render audit + content issues.",
  match_skills: "Skills relevant to a step (capped ≤3) with guidance digest.",
  run_tasks: "Run offline task explorer suite (T01–T06) or one taskId.",
  build_done_gate: "Resolve end-of-build phase: building | verify-board | celebrate.",
  expected_i2c: "Expected I2C devices/addresses derived from catalog-matched parts.",
  isolate_step: "focusPartIds for step isolation on the 3D stage.",
  build_wire_plan: "Exact wire callouts (color, endpoints, cut length) for the scene.",
  serial_connect: "LIVE — browser Web Serial only; returns live-required offline.",
  flash_firmware: "LIVE — browser flash only; returns live-required offline.",
  verify_expected_devices: "LIVE — needs serial session; returns live-required offline.",
};

export function mcpToolDescriptors(): McpToolDescriptor[] {
  return FORGE_MCP_TOOLS.map((name) => {
    const properties: Record<string, unknown> = { ...planProp };
    if (name === "get_step_facts" || name === "match_skills" || name === "isolate_step") {
      properties.stepNumber = { type: "number", description: "Build step number (not 0-based index)." };
    }
    if (name === "run_tasks") {
      properties.taskId = { type: "string", description: "Optional single task e.g. T04." };
    }
    if (name === "build_done_gate") {
      properties.allStepsComplete = { type: "boolean" };
      properties.wiringVerify = {
        type: "string",
        enum: ["not-required", "pending", "passed", "skipped"],
      };
    }
    return {
      name,
      description: DESCRIPTIONS[name] || name,
      inputSchema: {
        type: "object",
        properties,
        required: name.startsWith("serial") || name === "flash_firmware" || name === "verify_expected_devices"
          ? []
          : [],
      },
    };
  });
}

/**
 * Run offline task checks against a trust-pipelined plan (usually Sat Line).
 */

import type { BuildPlan } from "@/lib/types";
import { stepKind } from "@/lib/steps/classify";
import { auditConformance } from "@/lib/electrical/conformance";
import { auditPlanHarness } from "@/lib/product-3d/harness-conformance";
import { auditPlanRender } from "@/lib/product-3d/step-render-audit";
import { isolatePartIds } from "@/lib/stage/step-isolation";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import { netColorFor, wireColorName } from "@/lib/wire-colors";
import { skillById } from "@/lib/skills/catalog";
import { matchSkills } from "@/lib/skills/match";
import { TASKS, taskById } from "./catalog";
import type { TaskCheckResult, TaskId, TaskRunReport } from "./types";

function check(id: string, pass: boolean, detail: string): TaskCheckResult {
  return { id, pass, detail };
}

function runT01(plan: BuildPlan): TaskCheckResult[] {
  const parts = plan.parts || [];
  const named = parts.every((p) => (p.name || "").trim().length > 1);
  return [
    check("parts-exist", parts.length >= 4, `${parts.length} parts in BOM`),
    check("parts-named", named, named ? "all parts named" : "unnamed parts in BOM"),
  ];
}

function runT02(plan: BuildPlan): TaskCheckResult[] {
  const oledSteps = (plan.steps || []).filter((s) => {
    const blob = `${s.title} ${s.description}`.toLowerCase();
    return /oled|i2c|sda|scl|display/.test(blob) && stepKind(s) === "wiring";
  });
  const withMicro = oledSteps.filter((s) => (s.compiled?.microSteps?.length ?? 0) > 0);
  const focusOk = withMicro.every((s) => {
    const ids = isolatePartIds(s.compiled?.focusPartIds, null);
    return ids && ids.length >= 1 && ids.length < (plan.parts?.length ?? 99);
  });
  const sda = wireColorName(netColorFor("i2c", undefined, "SDA")).toLowerCase();
  const scl = wireColorName(netColorFor("i2c", undefined, "SCL")).toLowerCase();
  return [
    check("oled-wiring-steps", oledSteps.length > 0, `${oledSteps.length} OLED/I2C wiring step(s)`),
    check("micro-steps", withMicro.length > 0, `${withMicro.length} step(s) with micro-steps`),
    check("focus-subset", focusOk, focusOk ? "focus is a subset of BOM" : "focus too broad or missing"),
    check("sda-blue", sda === "blue", `SDA color=${sda}`),
    check("scl-yellow", scl === "yellow", `SCL color=${scl}`),
  ];
}

function runT03(plan: BuildPlan): TaskCheckResult[] {
  const prep = (plan.steps || []).filter((s) =>
    /\b(prepare|desolder|de-solder)\b|\bremove the .*(header|pins?)\b/i.test(s.title || "")
  );
  const clean = prep.every((s) => !(s.compiled?.connections?.length));
  return [
    check("prep-steps-found", prep.length > 0, prep.length ? `${prep.length} prep step(s)` : "no prep steps (skip if N/A)"),
    check(
      "prep-no-nets",
      prep.length === 0 || clean,
      clean || prep.length === 0 ? "prep steps clean of connection legs" : "prep step absorbed nets"
    ),
  ];
}

function runT04(plan: BuildPlan): TaskCheckResult[] {
  const table = auditConformance(plan);
  const harness = auditPlanHarness(plan);
  const renderErrors = auditPlanRender(plan).filter((f) => f.severity === "error");
  return [
    check("table-traced", table.traced, table.traced ? "instruction table 100%" : `table ${table.pct}%`),
    check("harness-traced", harness.traced, harness.traced ? "3D tubes 100%" : `${harness.backedTubes}/${harness.totalTubes}`),
    check("render-clean", renderErrors.length === 0, `${renderErrors.length} render error(s)`),
  ];
}

function runT05(plan: BuildPlan): TaskCheckResult[] {
  const soft = (plan.steps || []).filter((s) => stepKind(s) === "software");
  const skill = skillById("esp32c3-flash");
  const matched = matchSkills({
    stepKind: "software",
    stepBlob: "upload firmware flash",
  });
  return [
    check("software-steps", soft.length > 0, `${soft.length} software step(s)`),
    check("flash-skill", !!skill, "esp32c3-flash skill registered"),
    check(
      "flash-triggers",
      matched.some((s) => s.id === "esp32c3-flash"),
      "flash skill matches software context"
    ),
    check(
      "human-confirm",
      /Human must confirm flash/i.test(skill?.guidance || ""),
      "flash skill requires human confirm"
    ),
  ];
}

function runT06(plan: BuildPlan): TaskCheckResult[] {
  const devices = expectedI2cAddresses(plan);
  return [
    check("has-expected-i2c", devices.length > 0, `${devices.length} expected I2C device(s)`),
    check(
      "addresses-valid",
      devices.every((d) => d.addresses.every((a) => a > 0 && a < 0x80)),
      "I2C addresses in 7-bit range"
    ),
  ];
}

const RUNNERS: Record<string, (plan: BuildPlan) => TaskCheckResult[]> = {
  T01: runT01,
  T02: runT02,
  T03: runT03,
  T04: runT04,
  T05: runT05,
  T06: runT06,
};

export function runTask(taskId: TaskId, plan: BuildPlan): TaskRunReport {
  const def = taskById(taskId);
  const title = def?.title || taskId;
  const runner = RUNNERS[taskId];
  if (!runner) {
    return {
      taskId,
      title,
      pass: false,
      checks: [check("runner", false, `no offline runner for ${taskId}`)],
    };
  }
  const checks = runner(plan);
  return { taskId, title, pass: checks.every((c) => c.pass), checks };
}

export function runAllOfflineTasks(plan: BuildPlan): TaskRunReport[] {
  return TASKS.filter((t) => t.offline).map((t) => runTask(t.id, plan));
}

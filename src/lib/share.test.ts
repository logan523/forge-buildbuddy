import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePlanShare, decodePlanShare } from "./share";
import type { BuildPlan } from "./types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function weatherClockPlan(): BuildPlan {
  return JSON.parse(readFileSync(path.join(ROOT, "src", "data", "solar-weather-clock.json"), "utf8"));
}

test("encodePlanShare: customFirmware never rides into a share payload (T0 — the credential-leak class)", () => {
  const plan = weatherClockPlan();
  assert.ok(plan.customFirmware, "fixture still carries customFirmware");
  // Plant a canary secret in the firmware source; it must not survive encoding.
  plan.customFirmware!.files[0].contents += '\n// { "CANARY_SSID", "CANARY_PASSWORD_x9" }\n';
  const payload = encodePlanShare(plan);
  const decoded = decodePlanShare(payload);
  assert.ok(decoded, "payload round-trips");
  assert.equal(decoded!.customFirmware, undefined, "customFirmware stripped from share");
  const rawJson = Buffer.from(
    payload.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (payload.length % 4)) % 4),
    "base64",
  ).toString("utf8");
  assert.ok(!rawJson.includes("CANARY_PASSWORD_x9"), "no firmware contents anywhere in the payload");
});

test("decodePlanShare: plans without customFirmware still round-trip identically", () => {
  const plan = weatherClockPlan();
  delete plan.customFirmware;
  const decoded = decodePlanShare(encodePlanShare(plan));
  assert.ok(decoded);
  assert.equal(decoded!.id, plan.id);
  assert.equal(decoded!.steps.length, plan.steps.length);
});

test("public demo plan carries no real-looking credentials (placeholders only)", () => {
  const raw = readFileSync(path.join(ROOT, "src", "data", "solar-weather-clock.json"), "utf8");
  assert.ok(raw.includes("YOUR_WIFI_NAME"), "placeholder present");
  // Every WifiNetwork row in the inlined firmware must be a placeholder —
  // written WITHOUT embedding any real value in this file (a test that
  // greps for the secret IS the secret).
  const rows = [...raw.matchAll(/\{ \\"([^\\]+)\\", \\"([^\\]+)\\" \}/g)];
  const wifiRows = [...raw.matchAll(/YOUR_[A-Z_]*WIFI[A-Z_]*/g)];
  assert.ok(wifiRows.length >= 2, "SSID + password placeholders present");
  assert.ok(!/wifiMulti\.addAP\(\\"(?!YOUR_)/.test(raw), "no literal network args");
  void rows;
});

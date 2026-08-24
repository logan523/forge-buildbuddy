import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildPlan } from "@/lib/types";
import { applyTrustPipeline } from "@/lib/trust";
import { expectedI2cAddresses } from "@/lib/serial/expected-devices";
import type { DeviceVerdict } from "@/lib/serial/verify";
import { applyDeviceVerdictsToReality } from "./serial-bridge";
import { emptyReality } from "./reality";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const plan = () =>
  applyTrustPipeline(JSON.parse(readFileSync(path.join(ROOT, "src", "data", "sat-line.json"), "utf8")) as BuildPlan);

test("a found device fans out to ALL its joints as verified(i2c-scan), passing through made", () => {
  const p = plan();
  const devices = expectedI2cAddresses(p);
  const oled = devices.find((d) => /oled|ssd1306/i.test(d.label + d.catalogId));
  assert.ok(oled, "fixture expects an OLED");
  const verdicts: DeviceVerdict[] = [{ device: oled!, status: "found", foundAddress: 0x3c }];
  const r = applyDeviceVerdictsToReality(p, emptyReality(p.id), verdicts);
  const verified = Object.values(r.joints).filter((j) => j.state === "verified");
  assert.ok(verified.length >= 3, `OLED has power/gnd/sda/scl legs — got ${verified.length}`);
  for (const j of verified) {
    assert.equal(j.evidence?.source, "i2c-scan");
    assert.equal(j.evidence?.tier, "instrument");
  }
});

test("monotonic: a later missing verdict never rolls verification back", () => {
  const p = plan();
  const oled = expectedI2cAddresses(p).find((d) => /oled|ssd1306/i.test(d.label + d.catalogId))!;
  let r = applyDeviceVerdictsToReality(p, emptyReality(p.id), [{ device: oled, status: "found", foundAddress: 0x3c }]);
  const revAfterFound = r.revision;
  r = applyDeviceVerdictsToReality(p, r, [{ device: oled, status: "missing" }]);
  assert.equal(r.revision, revAfterFound, "missing wrote nothing");
  assert.ok(Object.values(r.joints).every((j) => j.state === "verified"));
});

test("idempotent: re-applying the same found verdicts bumps nothing", () => {
  const p = plan();
  const oled = expectedI2cAddresses(p).find((d) => /oled|ssd1306/i.test(d.label + d.catalogId))!;
  let r = applyDeviceVerdictsToReality(p, emptyReality(p.id), [{ device: oled, status: "found", foundAddress: 0x3c }]);
  const rev = r.revision;
  r = applyDeviceVerdictsToReality(p, r, [{ device: oled, status: "found", foundAddress: 0x3c }]);
  assert.equal(r.revision, rev);
});

test("waiting verdicts and unknown catalog ids write nothing", () => {
  const p = plan();
  const oled = expectedI2cAddresses(p).find((d) => /oled|ssd1306/i.test(d.label + d.catalogId))!;
  const fake = { ...oled, catalogId: "not-in-this-plan" };
  let r = applyDeviceVerdictsToReality(p, emptyReality(p.id), [
    { device: oled, status: "waiting" },
    { device: fake, status: "found", foundAddress: 0x10 },
  ]);
  assert.equal(r.revision, 0);
});

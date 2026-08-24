import "../../test-utils/dom";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  emptyReality,
  declareColor,
  clearColor,
  setJointState,
  colorForConnection,
  sameJointIdentity,
  sortEndpoints,
} from "./reality";
import { migrateWirechecks } from "./migrate";
import { exportReality, importReality } from "./export";
import { readReality, hydrateReality, commitReality, __resetRealityCache } from "./cache";
import type { CompiledConnection } from "@/lib/types";

beforeEach(() => {
  localStorage.clear();
  __resetRealityCache();
});

const joint = {
  connectionId: "GND:U7:GND",
  netName: "GND",
  netClass: "gnd",
  endpoints: [
    { ref: "U2", pin: "GND" },
    { ref: "U7", pin: "GND" },
  ] as [{ ref: string; pin: string }, { ref: string; pin: string }],
};

// --- reducer invariants (state machine drawn in the plan, enforced here) ---

test("verified REQUIRES evidence — a bare verified write is refused", () => {
  let r = emptyReality("p");
  r = setJointState(r, joint, "made");
  const before = r.revision;
  r = setJointState(r, joint, "verified"); // no evidence
  assert.equal(r.joints[joint.connectionId].state, "made", "state unchanged");
  assert.equal(r.revision, before, "refused writes don't bump revision");
  r = setJointState(r, joint, "verified", { source: "i2c-scan" });
  assert.equal(r.joints[joint.connectionId].state, "verified");
  assert.equal(r.joints[joint.connectionId].evidence?.tier, "instrument");
});

test("planned → verified is unreachable (must pass made)", () => {
  let r = emptyReality("p");
  r = setJointState(r, joint, "verified", { source: "i2c-scan" });
  assert.equal(r.joints[joint.connectionId], undefined, "no record minted by an illegal transition");
});

test("tug is self-report tier, never instrument", () => {
  let r = emptyReality("p");
  r = setJointState(r, joint, "made");
  r = setJointState(r, joint, "verified", { source: "tug" });
  assert.equal(r.joints[joint.connectionId].evidence?.tier, "self-report");
});

test("every mutation bumps the monotonic revision and appends an event", () => {
  let r = emptyReality("p");
  r = declareColor(r, { hex: "#92400e", name: "brown", netName: "GND" });
  r = setJointState(r, joint, "made");
  assert.equal(r.revision, 2);
  assert.equal(r.events.length, 2);
  assert.equal(r.events[0].kind, "color-declared");
});

test("joint identity is UNORDERED endpoints (eng E2 — hub flip cannot re-key a joint)", () => {
  const a: [{ ref: string; pin: string }, { ref: string; pin: string }] = [
    { ref: "U2", pin: "GND" },
    { ref: "U7", pin: "GND" },
  ];
  const flipped: [{ ref: string; pin: string }, { ref: string; pin: string }] = [a[1], a[0]];
  assert.ok(sameJointIdentity(a, flipped));
  const [s1] = sortEndpoints(a[1], a[0]);
  assert.equal(s1.ref, "U2", "stored sorted");
});

// --- colors ---

test('"GND is brown" is a net-level fact; connection declarations beat net', () => {
  let r = emptyReality("p");
  r = declareColor(r, { hex: "#92400e", name: "brown", netName: "GND" });
  assert.equal(colorForConnection(r, "GND:U7:GND", "GND")?.name, "brown");
  r = declareColor(r, { hex: "#e2e8f0", name: "white", label: "the striped one", connectionId: "GND:U7:GND" });
  assert.equal(colorForConnection(r, "GND:U7:GND", "GND")?.label, "the striped one");
  assert.equal(colorForConnection(r, "GND:U9:GND", "GND")?.name, "brown", "other legs keep the net color");
  r = clearColor(r, { connectionId: "GND:U7:GND" });
  assert.equal(colorForConnection(r, "GND:U7:GND", "GND")?.name, "brown", "clear falls back to net");
});

// --- migration (eng E9) ---

const edge = (id: string, netName: string, netClass: string): CompiledConnection => ({
  id,
  netName,
  netClass,
  fromRef: "U2",
  fromPin: "GND",
  fromLabel: "ESP32",
  toRef: "U7",
  toPin: "GND",
  toLabel: "OLED",
  colorHex: "#1e293b",
  colorName: "black",
  grade: "consistent",
});

test("migration: dashed planIds enumerate by prefix; orphans preserved, never dropped", () => {
  localStorage.setItem("forge-wirechecks-solar-weather-clock-5", JSON.stringify(["GND:U7:GND", "GONE:U9:SDA"]));
  localStorage.setItem("forge-wirechecks-solar-weather-clock-extra-7", JSON.stringify(["OTHER:U1:X"]));
  const r = migrateWirechecks("solar-weather-clock", [edge("GND:U7:GND", "GND", "gnd")]);
  assert.equal(r.joints["GND:U7:GND"].state, "made");
  assert.equal(r.joints["GND:U7:GND"].netClass, "gnd", "matched edge carries real net data");
  assert.equal(r.joints["GONE:U9:SDA"].state, "made", "orphan preserved");
  assert.equal(r.joints["GONE:U9:SDA"].netName, "GONE");
  assert.equal(r.joints["OTHER:U1:X"], undefined, "a DIFFERENT dashed planId's keys are not swept in");
});

test("migration: corrupt legacy entry is quarantined, the rest survive", () => {
  localStorage.setItem("forge-wirechecks-p-5", "not json{{{");
  localStorage.setItem("forge-wirechecks-p-6", JSON.stringify(["GND:U7:GND"]));
  const r = migrateWirechecks("p", [edge("GND:U7:GND", "GND", "gnd")]);
  assert.equal(Object.keys(r.joints).length, 1);
});

// --- export / import (eng E7, DX X6) ---

test("import: wrong plan, truncated file, newer schema each reject loudly with a fix", () => {
  const r = emptyReality("plan-a");
  assert.equal(importReality(exportReality(r), "plan-b").ok, false);
  assert.equal((importReality(exportReality(r), "plan-b") as { code: string }).code, "wrong-plan");
  assert.equal((importReality("{truncated", "plan-a") as { code: string }).code, "bad-json");
  const newer = { ...r, schemaVersion: 99 };
  const res = importReality(JSON.stringify(newer), "plan-a") as { code: string; fix: string };
  assert.equal(res.code, "newer-schema");
  assert.ok(res.fix.length > 0, "every rejection carries a fix");
});

test("import: verified joints DEMOTE to made + imported/self-report — a file cannot counterfeit a gate", () => {
  let r = emptyReality("p");
  r = setJointState(r, joint, "made");
  r = setJointState(r, joint, "verified", { source: "i2c-scan" });
  const res = importReality(exportReality(r), "p");
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.demotedEvidence, 1);
    const j = res.reality.joints[joint.connectionId];
    assert.equal(j.state, "made");
    assert.equal(j.evidence?.source, "imported");
    assert.equal(j.evidence?.tier, "self-report");
  }
});

// --- cache (eng E1): undefined ≠ empty ---

test("cache: not-hydrated is undefined, hydrated-empty is a real object — never collapsed", async () => {
  assert.equal(readReality("fresh-plan"), undefined, "before hydrate: UNKNOWN");
  await hydrateReality("fresh-plan");
  const after = readReality("fresh-plan");
  assert.ok(after, "after hydrate: a real (empty) reality");
  assert.equal(after!.revision, 0);
});

test("cache: hydrate runs the wirechecks migration exactly once and persists it", async () => {
  localStorage.setItem("forge-wirechecks-mig-plan-5", JSON.stringify(["GND:U7:GND"]));
  const r = await hydrateReality("mig-plan", [edge("GND:U7:GND", "GND", "gnd")]);
  assert.equal(r.joints["GND:U7:GND"].state, "made");
  const again = await hydrateReality("mig-plan");
  assert.equal(again.revision, r.revision, "second hydrate is a cache hit");
});

test("cache: commit is sync-visible and bumps what readers see", async () => {
  await hydrateReality("c-plan");
  let r = readReality("c-plan")!;
  r = declareColor(r, { hex: "#92400e", name: "brown", netName: "GND" });
  commitReality(r);
  assert.equal(readReality("c-plan")!.revision, 1);
});

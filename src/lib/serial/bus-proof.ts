/**
 * Bus proof — the "a sibling on these exact same wires already answered, so
 * they're proven good" reasoning that isolates a missing I2C device's fault
 * to its own joints, computed from plan.electrical instead of reasoned out
 * by hand in chat. Feeds the inline missing-device debug panel
 * (src/components/flash/missing-device-panel.tsx).
 *
 * Pure — no I/O, no React. Joins ExpectedDevice/DeviceVerdict (the live scan
 * results) to plan.electrical (the intended netlist) by catalogId, which is
 * an EXACT match for any part that produced an ExpectedDevice in the first
 * place: expected-devices.ts only builds one when part.catalogId is truthy,
 * and assignRefs (electrical/netlist.ts) sets
 * ElectricalComponent.catalogId = part.catalogId || mod?.id — the `||`
 * always short-circuits left here, so the two catalogId values are the same
 * string, not a fuzzy match.
 */

import type { BuildPlan, CompiledConnection } from "@/lib/types";
import type { ElectricalNet } from "@/lib/electrical/types";
import type { Diagnosis } from "@/lib/unstick";
import { sharedNetsForRef } from "@/lib/electrical/shared-bus";
import { edgesFromModel } from "@/lib/steps/compile";
import type { ExpectedDevice } from "./expected-devices";
import type { DeviceVerdict } from "./verify";

export interface NetSiblingProof {
  net: ElectricalNet;
  /** Other addressable I2C devices on this same net that the live scan already checked — excludes the MCU hub and any non-addressable part on the same rail, neither of which the scan independently verifies. */
  siblings: { ref: string; partId?: string; label: string; found: boolean }[];
  /** True once at least one sibling above was found. */
  proven: boolean;
}

export interface BusProof {
  /** Proven nets first, net declaration order otherwise. */
  nets: NetSiblingProof[];
  /** True when every shared net has a found sibling. */
  fullyProven: boolean;
  focusPartIds: string[];
  highlightWireIds: string[];
  doneWireIds: string[];
}

function otherEnd(edge: CompiledConnection, ref: string): string {
  return edge.fromRef === ref ? edge.toRef : edge.fromRef;
}

function wiresTouching(edges: CompiledConnection[], ref: string, netName: string): CompiledConnection[] {
  return edges.filter((e) => e.netName === netName && (e.fromRef === ref || e.toRef === ref));
}

/**
 * null when the failed device can't be placed on the electrical model at
 * all (no plan.electrical, or no component matches its catalogId) — the
 * caller falls back to plain unstick content with no diagram, never crashes.
 */
export function busProofForMissingDevice(
  plan: BuildPlan,
  failedDevice: ExpectedDevice,
  verdicts: DeviceVerdict[]
): BusProof | null {
  const model = plan.electrical;
  if (!model) return null;
  const failedComponent = model.components.find((c) => c.catalogId === failedDevice.catalogId);
  if (!failedComponent) return null;

  const componentsByRef = new Map(model.components.map((c) => [c.ref, c]));
  const verdictByCatalogId = new Map(
    verdicts.filter((v) => v.device.catalogId !== failedDevice.catalogId).map((v) => [v.device.catalogId, v])
  );
  const edges = edgesFromModel(plan, model);

  const focusPartIds = new Set<string>([failedComponent.partId]);
  const highlightWireIds = new Set<string>();
  const doneWireIds = new Set<string>();
  const nets: NetSiblingProof[] = [];

  for (const membership of sharedNetsForRef(model, failedComponent.ref)) {
    const ownEdges = wiresTouching(edges, failedComponent.ref, membership.net.name);
    for (const e of ownEdges) {
      highlightWireIds.add(e.id);
      const otherComponent = componentsByRef.get(otherEnd(e, failedComponent.ref));
      if (otherComponent) focusPartIds.add(otherComponent.partId);
    }

    const siblings: NetSiblingProof["siblings"] = [];
    for (const sib of membership.siblings) {
      const sibComponent = componentsByRef.get(sib.ref);
      const sibVerdict = sibComponent?.catalogId ? verdictByCatalogId.get(sibComponent.catalogId) : undefined;
      if (!sibVerdict) continue; // not an addressable device the scan checked — no evidence either way
      const found = sibVerdict.status === "found";
      siblings.push({ ref: sib.ref, partId: sibComponent?.partId, label: sibVerdict.device.label, found });
      if (found && sibComponent) {
        focusPartIds.add(sibComponent.partId);
        for (const e of wiresTouching(edges, sib.ref, membership.net.name)) doneWireIds.add(e.id);
      }
    }

    if (siblings.length === 0) continue; // nothing addressable to learn from on this net
    nets.push({ net: membership.net, siblings, proven: siblings.some((s) => s.found) });
  }

  // Stable sort (spec-guaranteed since ES2019): proven nets lead, otherwise
  // net declaration order is preserved — the reassuring part comes first.
  nets.sort((a, b) => Number(b.proven) - Number(a.proven));

  return {
    nets,
    fullyProven: nets.length > 0 && nets.every((n) => n.proven),
    focusPartIds: Array.from(focusPartIds),
    highlightWireIds: Array.from(highlightWireIds),
    doneWireIds: Array.from(doneWireIds),
  };
}

export interface BusProofSummary {
  headline: string;
  detail: string;
}

/** Human name for a net ("data (SDA)", "ground") — shared with the debug panel's per-net chip row so the wording never drifts from the reassurance copy above it. */
export function friendlyNetName(net: ElectricalNet): string {
  const n = net.name.toLowerCase();
  if (n.includes("sda")) return "data (SDA)";
  if (n.includes("scl")) return "clock (SCL)";
  if (net.netClass === "power") return "power";
  if (net.netClass === "gnd") return "ground";
  return net.name;
}

function joinFriendly(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** null when there's nothing shared to reason about at all (proof.nets is empty). */
export function describeBusProof(failedLabel: string, proof: BusProof): BusProofSummary | null {
  if (proof.nets.length === 0) return null;

  const proven = proof.nets.filter((n) => n.proven);
  const provenNames = joinFriendly(proven.map((n) => friendlyNetName(n.net)));
  // The common case is exactly one other addressable device sharing the bus;
  // falls back to neutral phrasing when more than one distinct label proved
  // different nets, so the copy never overclaims a single part did it all.
  const provingLabels = Array.from(
    new Set(proven.flatMap((n) => n.siblings.filter((s) => s.found).map((s) => s.label)))
  );
  const provingLabel = provingLabels.length === 1 ? provingLabels[0] : "another part on the same wires";

  if (proof.fullyProven) {
    return {
      headline: "Good news — most of your wiring is already proven.",
      detail: `${provingLabel} already answered on the exact same ${provenNames} wires ${failedLabel} uses. That means the problem is isolated to ${failedLabel}'s own connections — nothing upstream.`,
    };
  }

  if (proven.length > 0) {
    const unproven = proof.nets.filter((n) => !n.proven);
    const unprovenNames = joinFriendly(unproven.map((n) => friendlyNetName(n.net)));
    return {
      headline: "Some good news.",
      detail: `${provingLabel} already answered on the shared ${provenNames} wire${proven.length > 1 ? "s" : ""}, so those are proven good. The ${unprovenNames} wire${unproven.length > 1 ? "s" : ""} ${failedLabel} uses ${unproven.length > 1 ? "are" : "is"} shared too, but whatever else is on ${unproven.length > 1 ? "them" : "it"} hasn't answered either — so we can't rule ${unproven.length > 1 ? "those" : "that"} out yet.`,
    };
  }

  return {
    headline: "Nothing else on this device's wires has answered yet.",
    detail: `${failedLabel} shares its wiring with other parts, but none of them have answered either — so the fault could be anywhere on those shared wires, not just at ${failedLabel}.`,
  };
}

function netTags(net: ElectricalNet): string[] {
  const tags: string[] = [];
  const n = net.name.toLowerCase();
  if (n.includes("sda")) tags.push("sda");
  if (n.includes("scl")) tags.push("scl");
  if (net.netClass === "power") tags.push("power");
  if (net.netClass === "gnd") tags.push("gnd");
  return tags;
}

/**
 * Reorders + trims diagnose()'s output using a computed BusProof: an action
 * tagged with netHint is dropped once every one of its tags is already
 * proven by a sibling. Never empties a diagnosis's checklist — a diagnosis
 * that would lose every action keeps them all (an action-level proof isn't
 * grounds to hide the whole diagnosis), but still sorts to the back so an
 * untouched, still-fully-relevant diagnosis leads.
 */
export function filterDiagnosesByProof(diagnoses: Diagnosis[], proof: BusProof): Diagnosis[] {
  const provenTags = new Set(proof.nets.filter((n) => n.proven).flatMap((n) => netTags(n.net)));

  const withTrim = diagnoses.map((d) => {
    const kept = d.actions.filter(
      (a) => !(a.netHint && a.netHint.length > 0 && a.netHint.every((t) => provenTags.has(t)))
    );
    const trimmed = kept.length < d.actions.length;
    const finalActions = (kept.length > 0 ? kept : d.actions).map((a, i) => ({ ...a, order: i + 1 }));
    return { diagnosis: { ...d, actions: finalActions }, trimmed };
  });

  // Stable sort: untrimmed diagnoses lead, each group keeps diagnose()'s
  // own relative (likelihood/score) order.
  withTrim.sort((a, b) => Number(a.trimmed) - Number(b.trimmed));
  return withTrim.map((w) => w.diagnosis);
}

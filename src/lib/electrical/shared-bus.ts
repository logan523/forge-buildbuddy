/**
 * Shared-net topology queries — pure electrical-model reasoning, no I2C or
 * serial concept. Given a component ref, find which nets it shares with
 * other components: the basis for "a sibling already answered on this same
 * wire, so it's proven good" reasoning (see src/lib/serial/bus-proof.ts,
 * which is the only intended caller of this file).
 */

import type { ElectricalModel, ElectricalNet, NetMember } from "./types";

export interface SharedNetMembership {
  net: ElectricalNet;
  /** ref's own member entry on this net. */
  self: NetMember;
  /** Every OTHER member on the same net — physically the same wires. */
  siblings: NetMember[];
}

/**
 * Every net `ref` sits on, paired with who else is on it. Nets where `ref`
 * is alone are excluded — an unshared wire has no sibling to prove it good.
 */
export function sharedNetsForRef(model: ElectricalModel, ref: string): SharedNetMembership[] {
  const out: SharedNetMembership[] = [];
  for (const net of model.nets) {
    const members = net.members.filter((m) => m.ref && m.pin);
    const self = members.find((m) => m.ref === ref);
    if (!self) continue;
    const siblings = members.filter((m) => m !== self);
    if (siblings.length === 0) continue;
    out.push({ net, self, siblings });
  }
  return out;
}

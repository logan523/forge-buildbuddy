/**
 * Single hub authority for hub-and-spoke net topology.
 *
 * A multi-member net (a power/GND rail, a shared bus) has no inherent 2-node
 * topology — it's a hyperedge. Both the instruction compiler (edgesFromModel)
 * and the 3D harness fan it into hub→spoke legs, and they MUST pick the same
 * hub, or the rendered tubes stop matching the steps the beginner follows (and
 * the "Show me" node-pair glow misses). One function, imported by both.
 *
 * Heuristic: the source-ish member drives the rail (a regulator OUT, a power
 * source); absent a role signal, the first member. Deliberately simple — the
 * point is that compiler and harness agree, not that it's clever.
 */

import type { NetMember } from "./types";

export function pickHub(members: NetMember[]): NetMember {
  return members.find((m) => /source|out|power/i.test(m.role || "")) || members[0]!;
}

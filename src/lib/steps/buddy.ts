/**
 * "A buddy who's actually watching."
 *
 * It's 11pm, you're alone, and you just checked off your first wire with no idea
 * if that mattered. A warm line — the kind a friend on the couch would give —
 * arrives at the beats that matter: the first wire, the quiet-hero ground, the
 * halfway mark, the last one, and when you're clearly struggling. Sparse on
 * purpose (a line every wire is nagging, not warmth). Pure authored strings
 * mapped to events the guided flow already fires — no LLM, no latency.
 */

export interface BuddyContext {
  /** 0-based index of the wire being worked. */
  current: number;
  total: number;
  /** Wires already soldered. */
  doneCount: number;
  /** Net class of the current wire (e.g. "gnd", "i2c", "power"). */
  netClass: string;
  /** True once the beginner has opened the rescue on this wire more than once. */
  struggling?: boolean;
}

const isGnd = (netClass: string) => /^(gnd|ground)$/i.test(netClass);

export function encouragement(ctx: BuddyContext): string | null {
  const { current, total, doneCount, netClass, struggling } = ctx;
  if (total <= 0) return null;

  // 1) You're stuck — the most important moment to feel a hand on your shoulder.
  if (struggling) {
    return "This one's fiddly — breathe. Reheat the joint, add a touch of fresh solder; it's forgiving, and so is this step.";
  }

  // 2) The finish line.
  if (total > 1 && current === total - 1) {
    return "Last one. Get this and you power it up.";
  }

  // 3) The very first wire of the step.
  if (current === 0 && doneCount === 0) {
    return isGnd(netClass)
      ? "Start with ground — it's the wire that quietly saves you the weirdest bugs. One at a time, you've got this."
      : "One wire at a time. You've got this.";
  }

  // 4) Halfway — a real sense of pace.
  if (total >= 4 && doneCount === Math.floor(total / 2)) {
    return "Halfway there — nice pace.";
  }

  // 5) Any ground wire deserves its due.
  if (isGnd(netClass) && doneCount > 0) {
    return "Another ground — the quiet hero that prevents the strangest bugs.";
  }

  // Otherwise, stay quiet. Warmth is sparse.
  return null;
}

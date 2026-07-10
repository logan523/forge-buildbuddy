/**
 * "The Rock Everyone Trips On" — a friction ledger that makes the instructions
 * quietly learn where THIS builder gets stuck.
 *
 * When you struggle on a kind of step (open the rescue twice, fail a check), we
 * bump a counter for the matching "rock." Next time that same kind of step
 * appears — even in a different build — it opens with a heads-up that wasn't
 * there before: "Most people cross SDA and SCL here." It feels written by someone
 * who watched past-you trip on the exact same rock.
 *
 * No DB: the ledger lives in localStorage, so it compounds across YOUR sessions.
 * The same rock ids are what a future server would roll up across everyone.
 * The matching + selection are pure (testable); storage is a guarded wrapper.
 */

export interface RockContext {
  kind: string;
  /** Net classes present in the step (e.g. ["i2c","power","gnd"]). */
  netClasses: string[];
}

export interface Rock {
  id: string;
  matches: (ctx: RockContext) => boolean;
  /** The heads-up shown once the builder has tripped here before. */
  callout: string;
}

/** Authored rocks — the specific, common mistakes worth pre-empting. */
export const ROCKS: Rock[] = [
  {
    id: "i2c-sda-scl-swap",
    matches: (c) => c.kind === "wiring" && c.netClasses.includes("i2c"),
    callout:
      "Most people cross SDA and SCL here. Check it: SDA goes to SDA, SCL to SCL — swapping them means a blank screen (no damage), but it's the #1 head-scratcher.",
  },
  {
    id: "power-polarity",
    matches: (c) => c.kind === "wiring" && c.netClasses.includes("power"),
    callout:
      "The easy slip here is reversing + and −. Match the printed labels, not where the pin sits — reversed power is the one that lets the smoke out.",
  },
  {
    id: "gnd-forgotten",
    matches: (c) => c.kind === "wiring" && c.netClasses.includes("gnd"),
    callout:
      "Don't skip a ground. A missing GND is behind more 'it half-works' bugs than anything else — every part shares it.",
  },
];

/** Rocks that apply to this step. Pure. */
export function matchingRocks(ctx: RockContext): Rock[] {
  return ROCKS.filter((r) => r.matches(ctx));
}

/**
 * The one rock to pre-empt: the first matching rock the builder has tripped on
 * before (count ≥ 1). Pure — inject the count lookup so it's testable without
 * storage. Returns null when nothing applies or they've never struggled here.
 */
export function preemptiveRock(
  ctx: RockContext,
  countOf: (rockId: string) => number
): { rock: Rock; count: number } | null {
  for (const rock of matchingRocks(ctx)) {
    const count = countOf(rock.id);
    if (count >= 1) return { rock, count };
  }
  return null;
}

/* ── localStorage ledger (guarded; no-ops under SSR/tests) ─────────────── */

const KEY = "forge:friction";

function readLedger(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

export function frictionCount(rockId: string): number {
  return readLedger()[rockId] ?? 0;
}

export function bumpFriction(rockId: string): void {
  if (typeof localStorage === "undefined") return;
  const ledger = readLedger();
  ledger[rockId] = (ledger[rockId] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(ledger));
  } catch {
    // storage full / disabled — the ledger is a nicety, never load-bearing.
  }
}

/** Bump every rock that matches this step (called when the builder struggles). */
export function recordStruggle(ctx: RockContext): void {
  for (const r of matchingRocks(ctx)) bumpFriction(r.id);
}

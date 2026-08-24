/**
 * Constructors and readers for Claim. See ./types.ts for why this exists.
 *
 * The design rule every function here obeys: there is no way to get a value
 * out of a claim without saying, at the call site, what you want to happen
 * when there isn't one. No `.value`, no `??`, no default parameter that
 * quietly becomes the answer.
 */

import type { Claim, ClaimEvidenceTier, KnownClaim } from "./types";

export type { Claim, ClaimKind, ClaimEvidenceTier, KnownClaim } from "./types";

const now = () => new Date().toISOString();

/** Computed from something we control. `from` names the function or module. */
export function derived<T>(value: T, from: string): Claim<T> {
  return { kind: "derived", value, from };
}

/** The builder said so. Outranks derivation about their own bench. */
export function declared<T>(value: T, at: string = now()): Claim<T> {
  return { kind: "declared", value, at };
}

/** Something outside the model confirmed it. */
export function evidenced<T>(
  value: T,
  tier: ClaimEvidenceTier,
  at: string = now()
): Claim<T> {
  return { kind: "evidenced", value, tier, at };
}

/**
 * We don't know, and here is what would close it.
 *
 * `need` reaches the builder's eye verbatim, so write a sentence they can act
 * on -- "we haven't matched this to a part we've verified" beats "NO_MATCH".
 */
export function unknown<T = never>(need: string): Claim<T> {
  return { kind: "unknown", need };
}

/**
 * Lift a possibly-absent value. THE replacement for `a ?? b` at every place
 * that used to invent an answer: pass what is missing, get an honest claim.
 *
 *     derivedOr(getRealPart(id)?.mpnOrSku, "real-parts", "no verified match yet")
 *
 * Empty strings count as absent -- a blank label rendered as a value is the
 * same lie as a wrong one, just quieter.
 */
export function derivedOr<T>(
  value: T | null | undefined,
  from: string,
  need: string
): Claim<T> {
  if (value === null || value === undefined) return unknown<T>(need);
  if (typeof value === "string" && value.trim() === "") return unknown<T>(need);
  return derived(value, from);
}

/** True when the claim carries a value. Narrows for the compiler. */
export function isKnown<T>(c: Claim<T>): c is KnownClaim<T> {
  return c.kind !== "unknown";
}

/**
 * Read the value, or `undefined`. Named to be conspicuous at the call site:
 * if you are reaching for this inside a renderer, render the claim instead.
 * Legitimate uses are comparisons, sorting, and serialization.
 */
export function valueOrUndefined<T>(c: Claim<T>): T | undefined {
  return isKnown(c) ? c.value : undefined;
}

/**
 * Fold a claim into one result. The only total way to consume one -- the
 * compiler makes you write the unknown branch.
 */
export function fold<T, R>(
  c: Claim<T>,
  on: { known: (value: T, c: KnownClaim<T>) => R; unknown: (need: string) => R }
): R {
  return isKnown(c) ? on.known(c.value, c) : on.unknown(c.need);
}

/** Map the value, preserving provenance. An unknown stays unknown. */
export function mapClaim<T, U>(c: Claim<T>, f: (value: T) => U): Claim<U> {
  if (!isKnown(c)) return c as Claim<U>;
  if (c.kind === "derived") return { kind: "derived", value: f(c.value), from: c.from };
  if (c.kind === "declared") return { kind: "declared", value: f(c.value), at: c.at };
  return { kind: "evidenced", value: f(c.value), tier: c.tier, at: c.at };
}

/**
 * Precedence when several sources speak to one fact:
 * evidenced > declared > derived > unknown.
 *
 * Declared beats derived on purpose. The plan says the pad is `GND`; his
 * board says `G`. About his own bench, he is right and the plan is a guess
 * (docs/BUILD-REALITY.md). Evidence beats both because an instrument
 * answering is not an opinion.
 */
const RANK = { unknown: 0, derived: 1, declared: 2, evidenced: 3 } as const;

export function strongest<T>(...claims: Claim<T>[]): Claim<T> {
  let best: Claim<T> = unknown<T>("nothing has spoken to this yet");
  for (const c of claims) if (RANK[c.kind] > RANK[best.kind]) best = c;
  return best;
}

/**
 * Does this claim meet the bar a gate demands?
 *
 * Fail-closed by construction: unknown never passes, and a self-reported tug
 * never satisfies a request for instrument tier. A pre-power check exists to
 * prevent the hot-ESP moment, so "we haven't checked" must not read as safe.
 */
export function meetsBar<T>(
  c: Claim<T>,
  bar: { kind: "evidenced"; tier: ClaimEvidenceTier } | { kind: "declared" } | { kind: "derived" }
): boolean {
  if (c.kind === "unknown") return false;
  if (bar.kind === "derived") return true;
  if (bar.kind === "declared") return c.kind === "declared" || c.kind === "evidenced";
  if (c.kind !== "evidenced") return false;
  const order: ClaimEvidenceTier[] = ["self-report", "assisted", "instrument"];
  return order.indexOf(c.tier) >= order.indexOf(bar.tier);
}

/** Short provenance label for UI chrome. Never the value itself. */
export function provenanceLabel<T>(c: Claim<T>): string {
  switch (c.kind) {
    case "derived":
      return "from the circuit";
    case "declared":
      return "you told us";
    case "evidenced":
      return c.tier === "instrument" ? "proven live" : c.tier === "assisted" ? "checked by photo" : "you checked";
    case "unknown":
      return "not known yet";
  }
}

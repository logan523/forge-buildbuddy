/**
 * "Did I wire it wrong?" reverse-check.
 *
 * A beginner is sure something's off but can't check without powering up and
 * risking it. They pick a pin and the wire color they put there; Forge answers
 * from the netlist — is that the right color for that pin, and if not, what does
 * that pin actually carry and where does their color belong.
 *
 * Pure netlist lookup, NO model call — the reassurance (or the catch) is grounded
 * in the compiled wiring, so it can never hallucinate. Reuses the voltage-domain
 * authority to flag a genuinely dangerous cross (two different power islands).
 */

import type { CompiledConnection } from "@/lib/types";
import { domainForVolts, bridgesDomains, type VoltageDomain } from "@/lib/electrical/voltage-domains";

export interface ReverseCheckClaim {
  /** The silkscreen pin the beginner thinks they wired (e.g. "GND"). */
  pin: string;
  /** The wire color they believe they put on it (e.g. "red"). */
  saidColor: string;
}

export interface ReverseCheckResult {
  verdict: "ok" | "wrong" | "unknown";
  message: string;
  /** Where the color they named actually belongs (when wrong). */
  fixHint?: string;
  /** True when the mistake would bridge two different power islands (fry risk). */
  danger?: boolean;
}

const norm = (s: string) => s.toLowerCase().trim();

/** Pins a beginner can double-check in this step (deduped, with their board label). */
export function pinOptions(connections: CompiledConnection[]): { pin: string; label: string }[] {
  const seen = new Set<string>();
  const out: { pin: string; label: string }[] = [];
  for (const c of connections) {
    for (const [pin, label] of [
      [c.fromPin, c.fromLabel],
      [c.toPin, c.toLabel],
    ] as const) {
      const key = `${norm(label)}:${norm(pin)}`;
      if (pin && !seen.has(key)) {
        seen.add(key);
        out.push({ pin, label });
      }
    }
  }
  return out;
}

/** Distinct wire colors present in this step (for the color picker). */
export function colorOptions(connections: CompiledConnection[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of connections) {
    if (c.colorName && !seen.has(norm(c.colorName))) {
      seen.add(norm(c.colorName));
      out.push(c.colorName);
    }
  }
  return out;
}

/** Connections incident on a pin name (either end). */
function connsForPin(connections: CompiledConnection[], pin: string): CompiledConnection[] {
  const p = norm(pin);
  return connections.filter((c) => norm(c.fromPin) === p || norm(c.toPin) === p);
}

function domainOf(c: CompiledConnection): VoltageDomain {
  if (c.domainKey) {
    return {
      key: c.domainKey as VoltageDomain["key"],
      label: c.domainLabel ?? "",
      colorHex: c.domainColorHex ?? "",
      volts: c.domainVolts ?? null,
    };
  }
  return domainForVolts(c.domainVolts ?? undefined, c.netClass);
}

export function reverseCheck(
  connections: CompiledConnection[],
  claim: ReverseCheckClaim
): ReverseCheckResult {
  const incident = connsForPin(connections, claim.pin);
  if (!incident.length) {
    return {
      verdict: "unknown",
      message: `I don't see a pin marked "${claim.pin}" in this step's wiring. Double-check the label printed on the board.`,
    };
  }
  const said = norm(claim.saidColor);
  const correct = incident.find((c) => norm(c.colorName) === said);
  const actual = incident[0]!; // the pin's net (shared pins agree on net)

  if (correct) {
    return {
      verdict: "ok",
      message: `Correct — ${actual.toPin === claim.pin || actual.fromPin === claim.pin ? claim.pin : claim.pin} takes the ${actual.colorName} wire (${actual.netName}${actual.domainLabel ? `, ${actual.domainLabel}` : ""}). You're good.`,
    };
  }

  // Wrong color for this pin. Where does the color they named belong?
  const belongsOn = connections.filter((c) => norm(c.colorName) === said);
  const fixHint = belongsOn.length
    ? `The ${claim.saidColor} wire belongs on ${belongsOn
        .slice(0, 2)
        .map((c) => `${c.toLabel} · ${c.toPin}`)
        .join(" or ")}.`
    : undefined;

  // Danger: the pin's power island vs the island the said color's net lives on.
  const saidConn = belongsOn[0];
  const danger =
    !!saidConn && bridgesDomains(domainOf(actual), domainOf(saidConn));

  const dom = actual.domainLabel ? ` (${actual.domainLabel})` : "";
  return {
    verdict: "wrong",
    message: `That pin carries ${actual.netName}${dom} — its wire is ${actual.colorName}, not ${claim.saidColor}.${
      danger ? " Those are different voltages — move it before you power on, or you can fry a part." : " Move it before you power on."
    }`,
    fixHint,
    danger,
  };
}

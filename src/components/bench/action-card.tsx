"use client";

/**
 * ONE action, in the builder's world.
 *
 * This is the answer to the question the real build asked more than any other
 * — "Which do I pick up next", asked 30+ times across twelve days, because
 * the product could not answer it. Everything else on the bench screen is
 * subordinate to this card.
 *
 * Three rules it does not bend:
 *
 *   Verb first. "Solder the brown wire from G to GND", not a paragraph that
 *   contains that somewhere.
 *
 *   His words, not the plan's. If he declared the wire brown, it is brown
 *   here. If his board says `G`, it says G. The plan's pedagogy palette is
 *   the fallback, never the override (docs/BUILD-REALITY.md).
 *
 *   Nothing it cannot account for. Endpoints come from the compiled netlist;
 *   coordinates come from what he declared. There is no third source that
 *   fills gaps by guessing.
 */

import type { CursorAction } from "@/lib/actions/cursor";
import type { BuildReality } from "@/lib/build-reality";
import { describeHole } from "@/lib/breadboard/spec";
import { derived, declared, unknown, type Claim } from "@/lib/claim";
import { Fact } from "@/components/claim/fact";

/** The wire's colour as the builder would say it, falling back to the standard. */
export function colorClaim(a: CursorAction, reality?: BuildReality): Claim<string> {
  const c = a.connection;
  // colorSource === "user" means this came from BuildReality via the compile
  // stamp, so it outranks the class standard by construction.
  if (c.colorSource === "user") return declared(c.colorLabel || c.colorName, reality?.updatedAt ?? "");
  if (c.colorName) return derived(c.colorName, "wire-colors (class standard)");
  return unknown<string>("no colour assigned to this wire yet");
}

/** Where a wire end goes on a breadboard, if the builder has said. */
function holeClaim(a: CursorAction, reality: BuildReality | undefined, end: "from" | "to"): Claim<string> {
  const decls = reality?.breadboard?.declarations;
  if (!decls) return unknown<string>("");
  const ref = end === "from" ? a.connection.fromRef : a.connection.toRef;
  const pin = end === "from" ? a.connection.fromPin : a.connection.toPin;
  const hit = Object.values(decls).find((d) => d.key === `${a.connection.netName}:${ref}:${pin}`);
  if (!hit) return unknown<string>("");
  // describeHole is the authority for both main holes and rails; HoleRef is
  // a union and reaching into it directly only handles half the cases.
  return declared(describeHole(hit.hole), hit.at);
}

function Endpoint({
  lead,
  label,
  pin,
  hole,
}: {
  lead: string;
  label: string;
  pin: string;
  hole: Claim<string>;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-text-muted text-sm w-10 shrink-0">{lead}</span>
      <span className="text-text font-semibold text-lg">{label}</span>
      <span className="text-text-muted">·</span>
      {/* The silkscreen label, which is what is physically printed on his board. */}
      <code className="text-text font-mono font-bold text-lg">{pin}</code>
      {hole.kind !== "unknown" && (
        <>
          <span className="text-text-muted text-sm">into hole</span>
          <Fact claim={hole} render={(h) => <code className="font-mono font-bold text-lg text-accent">{h}</code>} />
        </>
      )}
    </div>
  );
}

export function ActionCard({
  action,
  reality,
}: {
  action: CursorAction;
  reality?: BuildReality;
}) {
  const color = colorClaim(action, reality);
  const c = action.connection;
  const verb = reality?.formFactor === "breadboard" ? "Push" : "Solder";

  return (
    <section className="space-y-3" aria-label="Your next action">
      <h2 className="text-2xl font-semibold text-text leading-snug">
        {verb} the{" "}
        <span className="inline-flex items-baseline gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full border border-border-subtle translate-y-px"
            style={{ backgroundColor: c.colorHex }}
            aria-hidden
          />
          <Fact claim={color} />
        </span>{" "}
        wire
      </h2>

      <div className="space-y-1.5">
        <Endpoint lead="from" label={c.fromLabel} pin={c.fromPin} hole={holeClaim(action, reality, "from")} />
        <Endpoint lead="to" label={c.toLabel} pin={c.toPin} hole={holeClaim(action, reality, "to")} />
      </div>
    </section>
  );
}

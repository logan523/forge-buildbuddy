"use client";

/**
 * The hard gate, at the render boundary.
 *
 * `Fact` accepts a `Claim<T>` and nothing else. There is no prop that takes a
 * bare value, so a component cannot render a fact it cannot account for --
 * `<Fact claim={buyGuidance(part).lookFor} />` typechecks and
 * `<Fact value={part.mpn ?? "SSD1306"} />` does not compile, because that prop
 * does not exist.
 *
 * When the claim is unknown, this renders the gap and what would close it.
 * That is the intended, shippable state -- screens WILL look emptier than the
 * ones that guessed, and the emptiness is the honest reading.
 *
 * See src/lib/claim/types.ts for the bug this was built to make impossible.
 */

import type { ReactNode } from "react";
import { fold, provenanceLabel, type Claim } from "@/lib/claim";

export interface FactProps<T> {
  claim: Claim<T>;
  /** How to draw the value when there is one. Defaults to plain text. */
  render?: (value: T) => ReactNode;
  /**
   * Show a small provenance chip beside the value. Off by default -- a badge
   * on every line is noise. Turn it on where the builder is deciding whether
   * to trust something: parts they will buy, joints before power.
   */
  showProvenance?: boolean;
  className?: string;
}

export function Fact<T>({ claim, render, showProvenance = false, className = "" }: FactProps<T>) {
  return fold(claim, {
    known: (value, c) => (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span>{render ? render(value) : String(value)}</span>
        {showProvenance && (
          <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">
            {provenanceLabel(c)}
          </span>
        )}
      </span>
    ),
    unknown: (need) => <Gap need={need} className={className} />,
  });
}

/**
 * A rendered absence. Deliberately looks like a real piece of content rather
 * than an error: not knowing which part someone holds is an ordinary state of
 * a build, not a fault, and styling it as a failure teaches the builder to
 * distrust the whole screen.
 */
export function Gap({ need, className = "" }: { need: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 text-text-muted italic ${className}`}
      data-claim="unknown"
    >
      {need}
    </span>
  );
}

/**
 * A labelled row that disappears entirely when unknown.
 *
 * For lines where an absence is not worth a sentence -- an optional note, a
 * secondary spec. Use `Fact` instead anywhere the builder would otherwise
 * assume the value exists; a silently missing "Look for:" is how someone ends
 * up buying the wrong part with no idea anything was withheld.
 */
export function OptionalFact<T>({
  label,
  claim,
  render,
}: {
  label: string;
  claim: Claim<T>;
  render?: (value: T) => ReactNode;
}) {
  return fold(claim, {
    known: (value) => (
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-text-muted">{label}</span>
        <span>{render ? render(value) : String(value)}</span>
      </span>
    ),
    unknown: () => null,
  });
}

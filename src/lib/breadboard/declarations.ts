/**
 * Coordinate declarations — the codified version of the chat elicitation
 * protocol ("brown is number __ … D14 sorry"). Last-write-wins with the full
 * correction history kept: a correction is an amendment, never an error.
 */

import type { HoleRef } from "./spec";

export interface HoleDeclaration {
  /** What this declaration is about — a wire end (`connectionId@ref:pin`) or a component pin (`pin:ref:pin`). */
  key: string;
  netName: string;
  netClass: string;
  /** Human words for verdict copy ("brown wire, OLED end"). */
  label: string;
  hole: HoleRef;
  at: string;
  /** Prior positions, oldest first — the "D14 sorry" trail. */
  history: { hole: HoleRef; at: string }[];
}

export type Declarations = Record<string, HoleDeclaration>;

export function declareHole(
  decls: Declarations,
  d: Omit<HoleDeclaration, "at" | "history">,
  now = new Date().toISOString()
): Declarations {
  const prev = decls[d.key];
  return {
    ...decls,
    [d.key]: {
      ...d,
      at: now,
      history: prev ? [...prev.history, { hole: prev.hole, at: prev.at }] : [],
    },
  };
}

export function clearHole(decls: Declarations, key: string): Declarations {
  const next = { ...decls };
  delete next[key];
  return next;
}

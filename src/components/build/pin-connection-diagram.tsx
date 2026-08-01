"use client";

/**
 * Primary wiring media — premium pad map (IBOM / Fritzing language).
 * Kept as a thin wrapper so older call sites (guided-steps, live AR HUD) still work.
 */

import type { MicroStep } from "@/lib/types";
import { PremiumPadMap } from "./premium-pad-map";

export function PinConnectionDiagram({
  micro,
  className = "",
}: {
  micro: MicroStep;
  className?: string;
}) {
  return <PremiumPadMap micro={micro} className={className} />;
}

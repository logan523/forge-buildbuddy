/**
 * "Isolation Walk" — the dead-board detective.
 *
 * The scariest failure is the silent one: nothing lights up, no clue, and you're
 * sure you bricked it. Instead of guessing, run a finite game: unplug everything
 * but the brain, upload Blink — did it blink? Then reconnect ONE part at a time
 * until the board dies, and name the exact culprit. Every path ends with a
 * certain answer, which for a beginner sure they destroyed an $8 board is the
 * single biggest confidence restorer there is. Entirely local, no AI.
 */

import type { Part } from "@/lib/types";
import { partCatalogId } from "@/lib/part-identity";

export interface IsolationWalk {
  /** The MCU you start from, alone. */
  brainLabel: string;
  /** Peripheral labels to reconnect one at a time, in order. */
  addOrder: string[];
}

const isBrain = (p: Part) =>
  partCatalogId(p) === "esp32_c3" || /esp|\bmcu\b|xiao|arduino|microcontroller|\bc3\b/i.test(p.name);

// Parts that aren't independently "reconnectable" modules — skip them in the walk.
const isPassiveOrStructural = (p: Part) =>
  /\bwire|jumper|solder|header|pcb|board|enclosure|case|screw|standoff|tape|bamboo\b/i.test(
    `${p.name} ${p.specification}`
  );

/** Build the walk from the BOM: brain first, then the real peripherals. */
export function buildIsolationWalk(parts: Part[]): IsolationWalk | null {
  const brain = parts.find(isBrain);
  if (!brain) return null;
  const addOrder = parts
    .filter((p) => p !== brain && !isBrain(p) && !isPassiveOrStructural(p))
    .map((p) => p.name);
  return { brainLabel: brain.name, addOrder };
}

/** The culprit part, once the board dies at a given reconnect step. */
export function isolationCulprit(walk: IsolationWalk, brokeAtIndex: number): string {
  return walk.addOrder[brokeAtIndex] ?? "the last part you added";
}

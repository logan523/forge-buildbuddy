/**
 * Hazard tags in human words.
 *
 * `hazardTags` are internal enum tokens — `LIPO`, `ESD_SENSITIVE`. They must
 * never reach a beginner raw. This lived inside a 546-line UI grab-bag until
 * that file was deleted; it is authority about the domain, not presentation,
 * so it belongs here where the copy can be tested.
 *
 * An unknown tag title-cases rather than disappearing. A hazard we can't name
 * is still a hazard, and silently dropping it is the one failure mode this
 * module must not have.
 */

const LABEL: Record<string, string> = {
  ESD_SENSITIVE: "Static-sensitive parts",
  LIPO: "Lithium battery",
  MAINS: "Wall-outlet voltage",
  SOLDERING: "Soldering involved",
  HEAT: "Gets hot",
  HIGH_CURRENT: "High current",
  MOVING: "Moving parts",
};

export function hazardLabel(tag: string): string {
  return (
    LABEL[tag] ??
    tag
      .toLowerCase()
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/**
 * Hazards that mean "read this before you touch anything", as opposed to
 * general good practice. These gate the start of a build.
 */
const BLOCKING = new Set(["LIPO", "MAINS", "HIGH_CURRENT"]);

export function isBlockingHazard(tag: string): boolean {
  return BLOCKING.has(tag);
}

/** True when this build must not start before the builder has read the risks. */
export function needsSafetyAck(tags: string[] | undefined): boolean {
  return (tags ?? []).some(isBlockingHazard);
}

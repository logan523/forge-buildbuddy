/**
 * Constrained part matching — candidates come from the plan BOM only.
 * Model cannot invent ids; parser enforces the set.
 * Silkscreen / pin OCR cues improve match confidence and bench tips.
 */

import type { Part } from "@/lib/types";
import { partCatalogId } from "@/lib/part-identity";
import { silkscreenPins } from "./manipulate";
import type { ScanCandidate, ScanConfidence, ScanMatchResult } from "./types";

export function candidatesFromParts(parts: Part[] | undefined | null): ScanCandidate[] {
  return (parts ?? []).map((p) => ({
    partId: p.id,
    name: p.name,
    specification: p.specification,
    catalogId: p.catalogId ?? partCatalogId(p) ?? undefined,
    ref: p.ref,
  }));
}

export const PART_SCAN_SYSTEM = `You are Forge's part scanner for electronics kits. The builder photographed ONE physical module on their bench. You match it to exactly one candidate from the provided list — or report unknown.

Also READ any silkscreen / package text you can see (OCR-style): chip marks, pin labels (GND, VCC, SDA, SCL, 3V3, GPIO…), module titles (ESP32-C3, OLED, TP4056, SHT30…).

Respond with ONLY a JSON object:
{
  "partId": "<exact candidate partId or null>",
  "confidence": "high" | "medium" | "low" | "unknown",
  "cues": ["short visual cue", "..."],
  "silkscreenText": ["strings read from board", "..."],
  "visiblePins": ["GND", "VCC", "..."],
  "manualCheck": "one sentence for the builder",
  "catalogHint": "<optional class like esp32_c3 or null>"
}

Rules:
- partId MUST be one of the candidate partId values, or null. Never invent an id.
- Prefer null + confidence "unknown" over a wrong match. Wrong match is worse than no match.
- confidence "high" only when silkscreen text, pin labels, connector layout, or distinctive shape clearly matches one candidate and rules out others.
- silkscreenText: quote characters you can actually read; empty array if none.
- visiblePins: pin names printed near headers; empty if not readable.
- cues quote shape/connectors (USB-C, OLED glass, battery cylinder, solar cell, 4-pin header…).
- manualCheck tells a beginner how to double-check.
- Output JSON only. No markdown.`;

export function buildPartScanUser(
  candidates: ScanCandidate[],
  opts?: { focusPartId?: string; focusHint?: string }
): string {
  const lines = candidates.slice(0, 40).map((c, i) => {
    const pins = silkscreenPins(c.catalogId);
    const bits = [
      `${i + 1}. partId=${c.partId}`,
      `name=${c.name.slice(0, 60)}`,
      c.specification ? `spec=${c.specification.slice(0, 80)}` : "",
      c.catalogId ? `catalog=${c.catalogId}` : "",
      c.ref ? `ref=${c.ref}` : "",
      pins.length ? `expectPins=${pins.slice(0, 8).join(",")}` : "",
    ].filter(Boolean);
    return bits.join(" | ");
  });

  const focus =
    opts?.focusPartId
      ? `BATCH FOCUS: Prefer matching partId=${opts.focusPartId}${opts.focusHint ? ` (${opts.focusHint})` : ""} if the photo could be that module. If clearly a different candidate, pick the correct one. If unclear, null.`
      : "";

  return [
    "Image 1 is the BUILDER'S photo of a single module on their bench.",
    "CANDIDATES (legal partId values only):",
    lines.join("\n") || "(none — return partId null)",
    focus,
    "Read silkscreen when possible. Match the photo to at most one candidate. Reply with the JSON object.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const CONF: ScanConfidence[] = ["high", "medium", "low", "unknown"];

function stringList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim().slice(0, 48))
    .slice(0, max);
}

/**
 * Parse model text. partId outside the candidate set becomes null + unknown.
 */
export function parseScanMatch(
  text: string,
  candidates: ScanCandidate[]
): ScanMatchResult {
  const allowed = new Set(candidates.map((c) => c.partId));
  const fallback: ScanMatchResult = {
    partId: null,
    confidence: "unknown",
    cues: [],
    silkscreenText: [],
    visiblePins: [],
    manualCheck:
      "Couldn't identify confidently — pick the part from your list or retake with the silkscreen facing the camera.",
    catalogHint: null,
  };

  const match = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!match) return fallback;

  try {
    const obj = JSON.parse(match[0]) as {
      partId?: unknown;
      confidence?: unknown;
      cues?: unknown;
      silkscreenText?: unknown;
      visiblePins?: unknown;
      manualCheck?: unknown;
      catalogHint?: unknown;
    };

    let partId: string | null =
      typeof obj.partId === "string" && obj.partId.trim() ? obj.partId.trim() : null;
    if (partId && !allowed.has(partId)) {
      partId = null;
    }

    let confidence: ScanConfidence =
      typeof obj.confidence === "string" && CONF.includes(obj.confidence as ScanConfidence)
        ? (obj.confidence as ScanConfidence)
        : "unknown";

    if (!partId) confidence = "unknown";

    // Boost confidence when silkscreen pins align with catalog expectations
    const silkscreenText = stringList(obj.silkscreenText, 8);
    const visiblePins = stringList(obj.visiblePins, 12);
    if (partId && confidence === "medium") {
      const cand = candidates.find((c) => c.partId === partId);
      const expected = silkscreenPins(cand?.catalogId).map((p) => p.toUpperCase());
      const seen = new Set(visiblePins.map((p) => p.toUpperCase()));
      const hits = expected.filter((p) => seen.has(p)).length;
      if (hits >= 2) confidence = "high";
    }

    const cues = stringList(obj.cues, 6);

    const manualCheck =
      typeof obj.manualCheck === "string" && obj.manualCheck.trim()
        ? obj.manualCheck.trim().slice(0, 240)
        : fallback.manualCheck;

    const catalogHint =
      typeof obj.catalogHint === "string" && obj.catalogHint.trim()
        ? obj.catalogHint.trim().slice(0, 40)
        : null;

    return {
      partId,
      confidence,
      cues,
      silkscreenText,
      visiblePins,
      manualCheck,
      catalogHint,
    };
  } catch {
    return fallback;
  }
}

/** Human label for UI chips */
export function confidenceLabel(c: ScanConfidence): string {
  switch (c) {
    case "high":
      return "Matched";
    case "medium":
      return "Likely";
    case "low":
      return "Unsure";
    default:
      return "Unknown";
  }
}

/** Parts still missing from bench inventory (for batch scan order). */
export function unscannedParts(
  parts: Part[],
  scannedPartIds: Set<string>
): Part[] {
  return parts.filter((p) => !scannedPartIds.has(p.id));
}

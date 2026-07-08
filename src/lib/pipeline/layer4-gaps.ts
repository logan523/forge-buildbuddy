import { getCatalog, matchPart } from "@/lib/catalog";
import type { ExtractResult, GapResult } from "./types";

/** L4 — catalog RAG inject + gap analysis (no LLM). */
export function analyzeGaps(extract: ExtractResult): GapResult {
  const catalogHints: string[] = [];
  const missingSpecs: string[] = [];
  const blockers: string[] = [];
  const enrichedPartNotes: Record<string, string> = {};

  for (const part of extract.parts) {
    const m = matchPart({ name: part.name, specification: part.specification });
    if (m.module && (m.confidence === "high" || m.confidence === "medium")) {
      const mod = m.module;
      catalogHints.push(
        `${part.name} → catalog ${mod.id}: ${mod.specs}; footguns: ${(mod.footguns || []).slice(0, 2).join("; ")}`
      );
      if (mod.footguns?.[0]) enrichedPartNotes[part.name] = mod.footguns[0];
      if (mod.isLithiumCell) {
        blockers.push("Lithium cell present — synthesis MUST include protection/charger module.");
      }
      if (mod.id === "hc-sr04") {
        blockers.push("HC-SR04 ECHO is 5V — if MCU is 3.3V, require level shift/divider in wiring.");
      }
    } else {
      missingSpecs.push(`${part.name}: weak catalog match — pinout ASSUMED; verify silkscreen.`);
    }

    if (!part.specification || part.specification.length < 4) {
      missingSpecs.push(`${part.name}: missing specification string for shopping.`);
    }
  }

  // Common missing companion parts
  const blob = extract.parts.map((p) => `${p.name} ${p.specification}`).join(" ").toLowerCase();
  const hasLipo = /\b(16340|18650|li-?ion|lipo)\b/.test(blob);
  const hasProtect = /\b(tp4056|bms|protection)\b/.test(blob);
  if (hasLipo && !hasProtect) {
    blockers.push("Add TP4056 (protected) or 1S BMS to BOM.");
  }

  // Catalog density for prompt
  const top = getCatalog()
    .slice(0, 12)
    .map((m) => `${m.id}: ${m.name} (${m.specs})`)
    .join("\n");
  catalogHints.push(`Reference modules available:\n${top}`);

  return { catalogHints, missingSpecs, blockers, enrichedPartNotes };
}

/**
 * Expected I2C devices — pure, C3. Cross-references a plan's catalog-matched
 * parts (src/lib/catalog.ts's enrichParts, run as part of applyTrustPipeline
 * in trust.ts) against modules-catalog.json's own i2cAddress/i2cAddressAlt
 * fields, so the "Wiring check" card (flash-console.tsx) knows which I2C
 * addresses a correctly-wired build should answer at — no hardcoded
 * catalogId->address table to keep in sync by hand: any future catalog part
 * that carries an i2cAddress is picked up automatically. Feeds verify.ts,
 * which cross-checks this list against what the live scanner actually finds.
 */

import type { BuildPlan } from "@/lib/types";
import { getModuleById } from "@/lib/catalog";
import type { SymptomId } from "@/lib/unstick";

export interface ExpectedDevice {
  /**
   * Every I2C address this device could legitimately answer at. An array,
   * not a single `address` — several of these catalog parts ship with an
   * ADDR pin/solder-jumper that picks between a primary and an alternate
   * address (SSD1306 0x3C/0x3D, SHT31D 0x44/0x45, BME280 0x76/0x77), and a
   * correctly-wired unit that simply came strapped to the alternate address
   * must not be reported as missing.
   */
  addresses: number[];
  /** Short, beginner-facing name for the Wiring check card, e.g. "OLED display". */
  label: string;
  /** This plan's own Part.name for the matched part (may be more specific/verbose than `label`). */
  partName: string;
  /** modules-catalog.json id this device was derived from. */
  catalogId: string;
  /** Real unstick.ts SymptomId to open if this device never answers — see symptomHintForCategory below. */
  symptomHint: SymptomId;
}

function parseHexAddress(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 16);
  return Number.isNaN(n) ? null : n;
}

// Short labels for the handful of I2C parts Forge's catalog carries today —
// deliberately terser than the catalog's full product name ("SSD1306 0.96
// inch OLED (I2C)" -> "OLED display") for the compact card row. A future I2C
// part this map hasn't been taught a short label for yet still works: it
// falls back to the catalog's own name (see expectedI2cAddresses below).
const SHORT_LABEL: Record<string, string> = {
  "ssd1306-i2c": "OLED display",
  "sht31d": "temp/humidity sensor",
  "bme280": "pressure/temp/humidity sensor",
};

/**
 * unstick.ts SymptomId to hand the "Debug this" button for a device that
 * never answers, derived from the catalog module's own `category` field
 * (display | sensor | ... — see modules-catalog.json) rather than a
 * per-catalogId table, so any future I2C display or sensor the catalog
 * gains is routed correctly without touching this file. Anything outside
 * those two categories (unexpected for an I2C part, but not impossible)
 * falls back to unstick.ts's own catch-all, "general".
 *
 * Exact mapping today (see modules-catalog.json's category field):
 *   ssd1306-i2c (category: "display")            -> "blank_display"
 *   sht31d, bme280 (category: "sensor")           -> "sensor_wrong"
 */
function symptomHintForCategory(category: string): SymptomId {
  if (category === "display") return "blank_display";
  if (category === "sensor") return "sensor_wrong";
  return "general";
}

/**
 * Expected I2C devices for a plan, derived from plan.parts' bound catalogIds
 * (set by enrichParts/applyTrustPipeline — a plan straight from disk with no
 * trust pipeline run over it yet, like the raw sat-line.json fixture, has no
 * catalogIds and correctly yields []). A plan with no I2C parts at all — no
 * electrical model, a mechanical-only build, or just nothing that matched —
 * also yields [], the honest "nothing to check" answer.
 *
 * Dedupes by catalogId: two parts matched to the same catalog module (e.g. a
 * BOM that accidentally lists the same OLED twice) collapse to one expected
 * device rather than two identical rows.
 */
export function expectedI2cAddresses(plan: BuildPlan): ExpectedDevice[] {
  const out: ExpectedDevice[] = [];
  const seen = new Set<string>();

  for (const part of plan.parts || []) {
    if (!part.catalogId || seen.has(part.catalogId)) continue;
    const mod = getModuleById(part.catalogId);
    if (!mod?.i2cAddress) continue; // not an I2C device with an address (e.g. an MCU board, or no catalog match)

    const primary = parseHexAddress(mod.i2cAddress);
    if (primary == null) continue;
    const alt = parseHexAddress(mod.i2cAddressAlt);
    const addresses = alt != null ? [primary, alt] : [primary];

    seen.add(part.catalogId);
    out.push({
      addresses,
      label: SHORT_LABEL[part.catalogId] ?? mod.name,
      partName: part.name,
      catalogId: part.catalogId,
      symptomHint: symptomHintForCategory(mod.category),
    });
  }

  return out;
}

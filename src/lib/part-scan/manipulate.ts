/**
 * How to physically hold / orient each catalog module when soldering.
 * Bench-specific language — pairs with the builder's scanned photo.
 */

import type { CatalogPartId } from "@/lib/product-3d/real-parts";
import { getRealPart } from "@/lib/product-3d/real-parts";

const TIPS: Partial<Record<CatalogPartId, string[]>> = {
  esp32_c3: [
    "Place the board flat, component side up, USB-C port facing you.",
    "Pin headers are along the long edges — read silkscreen next to each pad (3V3, GND, GPIO4, GPIO5…).",
    "Do not heat the USB-C connector; solder only the castellation / header pads.",
    "Hold the iron on pad + wire for 2–3s; ESP32 boards dislike prolonged heat on one pin.",
  ],
  oled_096: [
    "Face the black screen toward you; 4-pin header is usually on the top edge of the module.",
    "Common order left→right (module facing you): GND, VCC, SCL, SDA — verify YOUR silkscreen; clones reverse it.",
    "Support the module from underneath when soldering so the glass doesn't flex.",
    "Power VCC from 3.3V unless the module is explicitly 5V-tolerant.",
  ],
  sht30: [
    "Sensor face (grille or open window) up; 4-pin header on one edge.",
    "Match VCC/GND/SDA/SCL to silkscreen — same I2C bus colors as the OLED.",
    "Avoid covering the sensor opening with tape or flux.",
  ],
  ttp223: [
    "Touch pad face up; three pins often VCC, SIG, GND — read the board print.",
    "SIG goes to ESP32 GPIO0 (or the plan's signal pin); keep SIG wire short if possible.",
  ],
  tp4056: [
    "USB / charge side away from your hand; BAT+/BAT− pads toward the cell leads.",
    "Polarity is critical: red to BAT+, black to BAT−. Double-check before connecting the cell.",
    "Do not short B+/B− with the iron tip.",
  ],
  cell_16340: [
    "Never solder directly to a Li-ion cell without a protected holder if the plan specifies one.",
    "If soldering tabs: heat the tab, not the cell body; work quickly.",
    "Confirm polarity marks on the cell and the charging board before any joint.",
  ],
  solar_cell: [
    "Active face (blue/black photovoltaic surface) toward light; solder pads usually on the back.",
    "Use thin wire; solar cells crack under pressure — no prying.",
    "Match +/− to the charge controller IN+ / IN−.",
  ],
  generic_pcb: [
    "Orient so silkscreen text is readable; pad labels beat left/right memory.",
    "Tin the pad first, then bring the wire into the molten joint.",
  ],
};

export function orientationTipsForCatalog(
  catalogId: string | undefined | null
): string[] {
  if (!catalogId) return TIPS.generic_pcb ?? [];
  const id = catalogId as CatalogPartId;
  if (TIPS[id]) return TIPS[id]!;
  // fuzzy
  const t = catalogId.toLowerCase();
  if (/esp|c3|mcu/.test(t)) return TIPS.esp32_c3!;
  if (/oled|ssd|display/.test(t)) return TIPS.oled_096!;
  if (/sht|bme|temp|humid/.test(t)) return TIPS.sht30!;
  if (/touch|ttp/.test(t)) return TIPS.ttp223!;
  if (/tp4056|charg/.test(t)) return TIPS.tp4056!;
  if (/cell|16340|lipo|battery/.test(t)) return TIPS.cell_16340!;
  if (/solar/.test(t)) return TIPS.solar_cell!;
  return TIPS.generic_pcb ?? [];
}

/** Pin names we know for this catalog face (for UI “look for these letters”). */
export function silkscreenPins(catalogId: string | undefined | null): string[] {
  if (!catalogId) return [];
  const real = getRealPart(catalogId as CatalogPartId);
  if (!real) return [];
  return real.pins.map((p) => p.name);
}

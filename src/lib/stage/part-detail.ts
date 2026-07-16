/**
 * Recognition detail per catalog part — pure data, zero node-id coupling.
 *
 * The single source both renderers read:
 *   • the parametric fallback (part-fallback/*) draws silkscreen text, USB
 *     connectors, status LEDs and live screens FROM THIS TABLE — never from
 *     `node.id === "brain"`-style branches (the old isEsp/isTp/isSensor path);
 *   • the GLB authoring scripts (scripts/author-*.mjs) bake the same labels
 *     and connector geometry, so the fallback and the authored model can
 *     never visually disagree.
 *
 * real-parts.ts stays the dimension/pin authority; this file is only about
 * what makes a part RECOGNIZABLE. Parts without an entry render generic.
 */
import type { CatalogPartId } from "@/lib/product-3d";

export interface PartDetail {
  /** Board silkscreen text (the big human-readable marking). */
  silkscreenLabel?: string;
  usbConnector?: {
    kind: "usb_c" | "micro_usb";
    /** Which board edge it sits on. */
    edge: "short" | "long";
    widthMm: number;
    heightMm: number;
  };
  statusLeds?: { color: string; positionLocal: [number, number, number] }[];
  /** PCB-antenna meander zone (ESP-class boards). */
  antenna?: { positionLocal: [number, number, number]; sizeMm: [number, number, number] };
  /** Visible IC count on the parametric fallback. */
  chipCount?: number;
  /** Live screen overlay mode (generalizes the old `node.id === "face"`). */
  liveScreen?: "clock" | "readout";
}

export const PART_DETAIL: Partial<Record<CatalogPartId, PartDetail>> = {
  esp32_c3: {
    silkscreenLabel: "ESP32-C3",
    usbConnector: { kind: "usb_c", edge: "short", widthMm: 9, heightMm: 3.1 },
    antenna: { positionLocal: [0, 6, 1.7], sizeMm: [11, 4.6, 0.3] },
    statusLeds: [{ color: "#22c55e", positionLocal: [-4.5, 3.4, 1.95] }],
    chipCount: 3,
  },
  tp4056: {
    silkscreenLabel: "TP4056",
    usbConnector: { kind: "micro_usb", edge: "short", widthMm: 7.5, heightMm: 2.6 },
    statusLeds: [
      { color: "#ef4444", positionLocal: [6, 5, 1.9] },
      { color: "#22c55e", positionLocal: [9, 5, 1.9] },
    ],
    chipCount: 1,
  },
  oled_096: { liveScreen: "clock" },
  sht30: { silkscreenLabel: "SHT30", chipCount: 1 },
  ttp223: { silkscreenLabel: "TTP223" },
};

/** Detail for a catalog id (hyphen/underscore tolerated), or null. */
export function partDetailFor(catalogId?: string | null): PartDetail | null {
  if (!catalogId) return null;
  const key = catalogId.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return (PART_DETAIL as Record<string, PartDetail>)[key] ?? null;
}

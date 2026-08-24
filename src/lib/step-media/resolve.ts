import type { BuildStep } from "@/lib/types";
import type { StepMediaKind, StepMediaResult } from "./types";
import {
  svgBambooDrill,
  svgBatteryPoles,
  svgCutJumpers,
  svgFinalAssembly,
  svgGenericChecklist,
  svgI2cWiring,
  svgOledDesolder,
  svgSolarMount,
  svgTouchMount,
  svgUsbUpload,
  svgWireBendFrame,
} from "./diagrams";

const KIND_META: Record<
  StepMediaKind,
  { title: string; caption: string; svg: () => string }
> = {
  oled_desolder: {
    title: "OLED header removal",
    caption: "Heat each pin → pull → clean four pads (VCC GND SCL SDA).",
    svg: svgOledDesolder,
  },
  wire_bend_frame: {
    title: "Brass frame bends",
    caption: "Mark 8 / 14 / 22 cm, bend 90° at each mark, close the rectangle.",
    svg: svgWireBendFrame,
  },
  cut_jumpers: {
    title: "Cut jumpers",
    caption: "Four ~3 cm brass pieces. Eye protection on.",
    svg: svgCutJumpers,
  },
  battery_id_poles: {
    title: "Battery polarity",
    caption: "Match cell +/− to TP4056 BAT+/BAT−. No power yet.",
    svg: svgBatteryPoles,
  },
  touch_mount: {
    title: "Touch switch place",
    caption: "Pad on top of frame; VCC GND I/O ready for wires.",
    svg: svgTouchMount,
  },
  i2c_wiring: {
    title: "I2C + power wiring",
    caption: "Red 3V3, black GND, blue SDA, yellow SCL. No 5V on OLED.",
    svg: svgI2cWiring,
  },
  usb_upload: {
    title: "USB upload",
    caption: "Blink first, then I2C scanner for 0x3C.",
    svg: svgUsbUpload,
  },
  solar_panel_mount: {
    title: "Solar panel",
    caption: "Panel +/− → charger IN+/IN−; mount in light.",
    svg: svgSolarMount,
  },
  bamboo_base_drill: {
    title: "Bamboo base",
    caption: "Mark center, optional pilot hole, sand flat.",
    svg: svgBambooDrill,
  },
  final_assembly: {
    title: "Final assembly",
    caption: "Frame on base, screen toward you, wires free.",
    svg: svgFinalAssembly,
  },
  generic_checklist: {
    title: "Follow the checklist",
    caption: "Use You need → Do this → Done when on the right.",
    svg: () => svgGenericChecklist("This step"),
  },
};

const VALID_KINDS = new Set(Object.keys(KIND_META) as StepMediaKind[]);

export function isValidMediaKind(k: unknown): k is StepMediaKind {
  return typeof k === "string" && VALID_KINDS.has(k as StepMediaKind);
}

/** Infer media kind from step fields when mediaKind not set. */
export function inferStepMediaKind(step: BuildStep): StepMediaKind {
  // Only trust known kinds — LLM/share can send garbage
  if (isValidMediaKind(step.mediaKind)) return step.mediaKind;

  const t = `${step.title || ""} ${step.description || ""} ${step.goal || ""}`.toLowerCase();

  // Specific multi-token rules first
  if (/oled|ssd1306|display/.test(t) && /header|desolder|pin|remove|prepare/.test(t))
    return "oled_desolder";
  if (/cut|connector|jumper|3\s*cm/.test(t) && /brass|wire/.test(t)) return "cut_jumpers";
  if (/brass|frame/.test(t) && /bend|mark|prepare|wire frame/.test(t)) return "wire_bend_frame";
  if (
    /battery|16340|tp4056|polarity|bat\+/.test(t) &&
    !/level|indicator|assembl|test|calibrat|verify/.test(t)
  )
    return "battery_id_poles";
  if (/wire all|i2c|sda|scl|gpio4|gpio5/.test(t) || (/connect|solder/.test(t) && /esp|oled/.test(t)))
    return "i2c_wiring";
  if (/upload|code|firmware|blink|usb/.test(t) && !/assembl|mount|bend|cut/.test(t))
    return "usb_upload";
  if (/solar|panel/.test(t) && !/test|verify/.test(t)) return "solar_panel_mount";
  if (/bamboo|coaster|base/.test(t) && /drill|prepare|sand/.test(t)) return "bamboo_base_drill";
  // Assemble / test before touch (touch keyword appears in verify steps)
  if (/assembl|everything|final|mount.*base|seat frame/.test(t)) return "final_assembly";
  if (/test|calibrat|verify|power on/.test(t)) return "final_assembly";
  if (/touch|ttp223/.test(t)) return "touch_mount";
  return "generic_checklist";
}

export function resolveStepMedia(step: BuildStep): StepMediaResult {
  const kind = inferStepMediaKind(step);
  const meta = KIND_META[kind] || KIND_META.generic_checklist;
  const rawSvg =
    kind === "generic_checklist"
      ? svgGenericChecklist(step.goal || step.title || "This step")
      : meta.svg();
  return {
    kind,
    title: meta.title,
    caption: meta.caption,
    // Native-pixel sheet: pass width/height through untouched so text keeps
    // its authored size; hosts scroll horizontally instead of squishing.
    svg: rawSvg,
  };
}

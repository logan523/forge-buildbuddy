import { z } from "zod";
import { FORM_TEMPLATE_IDS, type FormSpec } from "./types";

const LayoutOffsetSchema = z.object({
  x: z.number().min(-400).max(400),
  y: z.number().min(-400).max(400),
  rot: z.number().min(-180).max(180).optional(),
});

const FormSpecSchema = z.object({
  templateId: z.enum(FORM_TEMPLATE_IDS),
  params: z.record(z.string(), z.number()).optional().default({}),
  materials: z
    .object({
      base: z.enum(["bamboo", "pla", "acrylic", "metal", "unknown"]).optional(),
      frame: z.enum(["brass", "copper", "pla", "unknown"]).optional(),
      face: z.enum(["oled", "lcd", "none"]).optional(),
    })
    .optional()
    .default({}),
  layers: z.record(z.string(), z.array(z.string())).optional().default({}),
  layout: z.record(z.string(), LayoutOffsetSchema).optional(),
  productCaption: z.string().trim().min(1).max(200).optional(),
  source: z.enum(["demo_golden", "template_match", "llm", "fallback"]).optional(),
  grade: z.enum(["high", "medium", "assumed"]).optional(),
});

function coerceTemplateId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase().replace(/-/g, "_");
  const aliases: Record<string, string> = {
    sat: "sat_clock",
    satellite: "sat_clock",
    sat_line: "sat_clock",
    clock: "sat_clock",
    weather: "weather_stick",
    stick: "weather_stick",
    robot: "robot_chassis",
    rover: "robot_chassis",
    chassis: "robot_chassis",
    pod: "sensor_pod",
    boxed: "boxed_gadget",
    box: "boxed_gadget",
    enclosure: "boxed_gadget",
    breadboard: "breadboard",
    proto: "breadboard",
  };
  if ((FORM_TEMPLATE_IDS as readonly string[]).includes(t)) return t;
  return aliases[t] || null;
}

/** Soft-parse untrusted FormSpec (LLM / share). */
export function parseFormSpec(input: unknown): FormSpec | undefined {
  if (input == null || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  const templateId = coerceTemplateId(o.templateId ?? o.template ?? o.form);
  if (!templateId) return undefined;

  const candidate = {
    templateId,
    params: o.params && typeof o.params === "object" ? o.params : {},
    materials: o.materials && typeof o.materials === "object" ? o.materials : {},
    layers: o.layers && typeof o.layers === "object" ? o.layers : {},
    productCaption:
      typeof o.productCaption === "string"
        ? o.productCaption
        : typeof o.caption === "string"
          ? o.caption
          : undefined,
    source: o.source,
    grade: o.grade,
  };

  const r = FormSpecSchema.safeParse(candidate);
  if (!r.success) return undefined;

  const layers: FormSpec["layers"] = {};
  for (const [k, v] of Object.entries(r.data.layers || {})) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      layers[k as keyof FormSpec["layers"]] = v.filter((id) => id.trim().length > 0);
    }
  }

  const layout: NonNullable<FormSpec["layout"]> = {};
  if (r.data.layout) {
    for (const [k, v] of Object.entries(r.data.layout)) {
      if (v && typeof v.x === "number" && typeof v.y === "number") {
        (layout as Record<string, { x: number; y: number; rot?: number }>)[k] = {
          x: v.x,
          y: v.y,
          ...(v.rot != null ? { rot: v.rot } : {}),
        };
      }
    }
  }

  return {
    templateId: r.data.templateId,
    params: r.data.params || {},
    materials: r.data.materials || {},
    layers,
    ...(Object.keys(layout).length ? { layout } : {}),
    productCaption: r.data.productCaption || "Your finished build",
    source: r.data.source || "llm",
    grade: r.data.grade || "assumed",
  };
}

export function sanitizeFormSpec(input: unknown): FormSpec | undefined {
  return parseFormSpec(input);
}

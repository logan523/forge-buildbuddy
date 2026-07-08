import type { BuildPlan } from "@/lib/types";
import { classifyRole } from "../build-scene";
import { layersFromParts } from "./layers";
import type { FormSpec, FormTemplateId } from "./types";

function blob(plan: BuildPlan): string {
  return `${plan.title} ${plan.description} ${(plan.parts || [])
    .map((p) => `${p.name} ${p.specification} ${p.catalogId || ""}`)
    .join(" ")}`.toLowerCase();
}

/**
 * Score templates from BOM + title. Higher = better match.
 */
export function scoreTemplates(plan: BuildPlan): { id: FormTemplateId; score: number }[] {
  const t = blob(plan);
  const roles = new Set((plan.parts || []).map(classifyRole));
  const scores: Record<FormTemplateId, number> = {
    sat_clock: 0,
    weather_stick: 0,
    robot_chassis: 0,
    sensor_pod: 0,
    boxed_gadget: 0,
    breadboard: 1, // weak default floor
  };

  // sat_clock
  if (/sat\s*line|satellite|smart\s*clock/.test(t)) scores.sat_clock += 12;
  if (/bamboo|coaster/.test(t)) scores.sat_clock += 6;
  if (/brass|copper\s*tube|wire\s*frame/.test(t)) scores.sat_clock += 5;
  if (roles.has("display")) scores.sat_clock += 4;
  if (roles.has("solar")) scores.sat_clock += 4;
  if (roles.has("display") && (roles.has("mech") || /frame|bamboo/.test(t))) scores.sat_clock += 3;

  // weather_stick
  if (/weather|outdoor|garden|plant|moisture|soil|stake|mast/.test(t)) scores.weather_stick += 10;
  if (roles.has("sensor") && !roles.has("display")) scores.weather_stick += 4;
  if (roles.has("sensor") && /tall|stick|pole|rod/.test(t)) scores.weather_stick += 5;

  // robot
  if (/robot|rover|chassis|wheeled|motor|tank/.test(t)) scores.robot_chassis += 12;
  if (/wheel|motor|servo|l298|a4988/.test(t)) scores.robot_chassis += 6;
  if (roles.has("mcu") && /drive|robot|rover/.test(t)) scores.robot_chassis += 3;

  // sensor pod
  if (/wearable|badge|pendant|beacon|tracker|keychain/.test(t)) scores.sensor_pod += 10;
  if (roles.has("sensor") && roles.has("mcu") && (plan.parts || []).length <= 5) scores.sensor_pod += 3;

  // boxed
  if (/enclosure|case|3d\s*print|box|housing/.test(t)) scores.boxed_gadget += 8;
  if (roles.has("display") && roles.has("mcu") && !/bamboo|brass|frame|solar/.test(t))
    scores.boxed_gadget += 4;

  // breadboard — loose electronics with no structure
  if (/breadboard|jumper|prototype|protoboard/.test(t)) scores.breadboard += 8;
  if ((plan.parts || []).length > 0 && scores.sat_clock < 5 && scores.robot_chassis < 5) {
    scores.breadboard += 2;
  }

  return (Object.entries(scores) as [FormTemplateId, number][])
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export function matchFormSpec(plan: BuildPlan): FormSpec {
  const ranked = scoreTemplates(plan);
  const best = ranked[0] || { id: "breadboard" as FormTemplateId, score: 0 };
  const second = ranked[1]?.score ?? 0;
  const grade =
    best.score >= 10 ? "high" : best.score >= 5 ? "medium" : "assumed";

  // Prefer boxed over breadboard when we have an MCU+display and low structure score
  let templateId = best.id;
  if (best.score < 4) templateId = "breadboard";

  const t = blob(plan);
  const materials: FormSpec["materials"] = {};
  if (/bamboo|wood/.test(t)) materials.base = "bamboo";
  else if (/pla|3d|print|acrylic/.test(t)) materials.base = "pla";
  else materials.base = "unknown";
  if (/brass/.test(t)) materials.frame = "brass";
  else if (/copper/.test(t)) materials.frame = "copper";
  else materials.frame = "unknown";
  if (/oled|ssd1306/.test(t)) materials.face = "oled";
  else if (/lcd|display/.test(t)) materials.face = "lcd";
  else materials.face = "none";

  const captions: Record<FormTemplateId, string> = {
    sat_clock: "Desk satellite-style clock — base, frame, display, and power.",
    weather_stick: "Outdoor-style sensor stick with head and mast.",
    robot_chassis: "Small wheeled robot chassis with control board.",
    sensor_pod: "Compact sensor pod you can hold or hang.",
    boxed_gadget: "Enclosed gadget with electronics inside a case.",
    breadboard: "Prototype on a breadboard (not a finished enclosure).",
  };

  return {
    templateId,
    params: { heightScale: 1, wingSpan: 1 },
    materials,
    layers: layersFromParts(plan.parts || []),
    productCaption: captions[templateId],
    source: "template_match",
    grade: best.score - second < 2 && best.score < 8 ? "assumed" : grade,
  };
}

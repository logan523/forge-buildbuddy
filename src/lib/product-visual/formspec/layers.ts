import type { BuildPlan, Part } from "@/lib/types";
import { classifyRole } from "../build-scene";
import type { FormLayerId, FormSpec, LayerPaint } from "./types";
import type { AssemblyStage } from "../types";

/** Map part → primary form layer by role/name. */
export function partToLayer(part: Part): FormLayerId {
  const role = classifyRole(part);
  const n = `${part.name} ${part.specification} ${part.catalogId || ""}`.toLowerCase();
  if (role === "mech") {
    if (/bamboo|coaster|base|wood/.test(n)) return "base";
    if (/wheel|track|tire/.test(n)) return "wheels";
    if (/brass|copper|tube|wire|frame|rod|stake|mast/.test(n)) return "frame";
    return "frame";
  }
  if (role === "display") return "face";
  if (role === "mcu") return "brain";
  if (role === "sensor") return "sensor";
  if (role === "input") return "touch";
  if (role === "solar") return "wings";
  if (role === "battery" || role === "power") return "power";
  return "body";
}

/** Auto-build layers map from BOM. */
export function layersFromParts(parts: Part[]): FormSpec["layers"] {
  const layers: FormSpec["layers"] = {};
  for (const p of parts) {
    if (!p.id) continue;
    const layer = partToLayer(p);
    const list = layers[layer] || [];
    list.push(p.id);
    layers[layer] = list;
  }
  return layers;
}

export function paintLayer(
  layer: FormLayerId,
  spec: FormSpec,
  stage: AssemblyStage
): LayerPaint {
  const partIds = spec.layers[layer] || [];
  const placed = new Set(
    stage.placedPartIds?.length ? stage.placedPartIds : stage.visiblePartIds
  );
  const hi = new Set(stage.highlightPartIds);

  if (stage.stepNumber === 0 || stage.mode === "full") {
    if (partIds.some((id) => hi.has(id))) return "highlight";
    return "placed";
  }

  if (partIds.length === 0) {
    // Structural default: base/frame ghost until something placed
    if (layer === "base" || layer === "frame" || layer === "body" || layer === "shell") {
      return stage.placedPartIds.length > 2 ? "placed" : "ghost";
    }
    return "ghost";
  }

  if (partIds.some((id) => hi.has(id))) return "highlight";
  if (partIds.some((id) => placed.has(id))) return "placed";
  return "ghost";
}

export function layerOpacity(paint: LayerPaint): number {
  if (paint === "ghost") return 0.18;
  if (paint === "highlight") return 1;
  return 0.92;
}

export function ensureLayers(spec: FormSpec, plan: BuildPlan): FormSpec {
  const hasAny = Object.values(spec.layers || {}).some((a) => a && a.length > 0);
  if (hasAny) return spec;
  return {
    ...spec,
    layers: layersFromParts(plan.parts || []),
  };
}

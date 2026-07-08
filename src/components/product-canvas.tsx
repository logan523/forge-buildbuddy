"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import type { ProductVisual } from "@/lib/product-visual";
import type { FormLayerId, FormLayoutOffset, FormSpec } from "@/lib/product-visual/formspec/types";
import { buildProductVisual } from "@/lib/product-visual";
import { SAT_CLOCK_ANCHORS, renderOledCloseup } from "@/lib/product-visual/templates/sat-clock";

const EDITABLE: FormLayerId[] = ["touch", "face", "wings", "sensor", "brain", "power"];

const PRESETS: { label: string; layout: Partial<Record<FormLayerId, FormLayoutOffset>> }[] = [
  { label: "Button top", layout: { touch: { x: 0, y: 0 } } },
  { label: "Button left", layout: { touch: { x: -72, y: 55 } } },
  { label: "Button right", layout: { touch: { x: 72, y: 55 } } },
];

export function ProductCanvas({
  plan,
  visual,
  stepIndex = "prep",
  compact = false,
  onLayoutChange,
}: {
  plan: BuildPlan;
  visual: ProductVisual;
  stepIndex?: number | "prep";
  compact?: boolean;
  onLayoutChange?: (layout: NonNullable<FormSpec["layout"]>) => void;
}) {
  const baseSpec = visual.formSpec || plan.formSpec;
  const [layout, setLayout] = useState<NonNullable<FormSpec["layout"]>>(
    () => baseSpec?.layout || {}
  );
  const [edit, setEdit] = useState(false);
  const drag = useRef<{ layer: FormLayerId; startX: number; startY: number; ox: number; oy: number } | null>(
    null
  );

  const liveVisual = useMemo(() => {
    if (!baseSpec) return visual;
    const formSpec: FormSpec = { ...baseSpec, layout };
    return buildProductVisual({ ...plan, formSpec });
  }, [plan, baseSpec, layout, visual]);

  const svg = liveVisual.svgForStep(stepIndex, false);
  const stage = liveVisual.stageForStep(stepIndex);
  const isOledStep =
    typeof stepIndex === "number" &&
    /oled|display|ssd1306/i.test(
      `${plan.steps?.[stepIndex]?.title || ""} ${plan.steps?.[stepIndex]?.description || ""}`
    );

  const commit = useCallback(
    (next: NonNullable<FormSpec["layout"]>) => {
      setLayout(next);
      onLayoutChange?.(next);
    },
    [onLayoutChange]
  );

  const onPointerDown = (layer: FormLayerId, e: React.PointerEvent) => {
    if (!edit) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const cur = layout[layer] || { x: 0, y: 0 };
    drag.current = {
      layer,
      startX: e.clientX,
      startY: e.clientY,
      ox: cur.x,
      oy: cur.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !edit) return;
    const scale = 480 / Math.max(1, (e.currentTarget as HTMLElement).clientWidth || 480);
    const dx = (e.clientX - drag.current.startX) * scale;
    const dy = (e.clientY - drag.current.startY) * scale;
    const layer = drag.current.layer;
    setLayout((prev) => ({
      ...prev,
      [layer]: {
        x: Math.max(-200, Math.min(200, drag.current!.ox + dx)),
        y: Math.max(-200, Math.min(200, drag.current!.oy + dy)),
      },
    }));
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setLayout((prev) => {
      onLayoutChange?.(prev);
      return prev;
    });
  };

  // Sync layout when parent formSpec changes externally
  // (avoid loop — only initial)

  return (
    <div className={`rounded-xl border border-border-subtle bg-surface overflow-hidden ${compact ? "" : "mb-4"}`}>
      <div className="px-3 pt-2 pb-1 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          {stepIndex === "prep" ? "What you’re building" : "Your product"}
        </p>
        <div className="flex items-center gap-1.5">
          {liveVisual.formSpec && (
            <span className="text-[9px] text-text-muted uppercase">{liveVisual.formSpec.grade}</span>
          )}
          <button
            type="button"
            onClick={() => setEdit((v) => !v)}
            className={`text-[10px] px-2 py-1 rounded-md border cursor-pointer ${
              edit ? "bg-accent text-white border-accent" : "border-border-subtle text-text-muted"
            }`}
          >
            {edit ? "Done moving" : "Move parts"}
          </button>
          {edit && (
            <button
              type="button"
              onClick={() => commit({})}
              className="text-[10px] px-2 py-1 rounded-md border border-border-subtle text-text-muted cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <p className="px-3 text-xs text-text-secondary pb-1">{stage.caption}</p>

      {edit && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => commit({ ...layout, ...p.layout })}
              className="text-[10px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:border-accent cursor-pointer"
            >
              {p.label}
            </button>
          ))}
          <span className="text-[10px] text-text-muted self-center ml-1">or drag the labels</span>
        </div>
      )}

      <div
        className="relative px-2 pb-2"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="w-full rounded-lg border border-border-subtle overflow-hidden bg-[#f4f1eb]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        {edit && baseSpec?.templateId === "sat_clock" && (
          <div className="absolute inset-2 pointer-events-none">
            {EDITABLE.map((layer) => {
              const a = SAT_CLOCK_ANCHORS[layer];
              if (!a) return null;
              const off = layout[layer] || { x: 0, y: 0 };
              // Approximate % from template 480×380
              const left = ((a.x + off.x) / 480) * 100;
              const top = ((a.y + off.y) / 380) * 100;
              return (
                <button
                  key={layer}
                  type="button"
                  className="absolute pointer-events-auto px-1.5 py-0.5 rounded bg-accent text-white text-[9px] font-semibold shadow cursor-grab active:cursor-grabbing border border-white/40"
                  style={{ left: `${left}%`, top: `${top}%`, transform: "translate(-50%, -50%)" }}
                  onPointerDown={(e) => onPointerDown(layer, e)}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isOledStep && (
        <div className="px-3 pb-3">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
            Close-up: OLED pads
          </p>
          <div
            className="rounded-lg border border-border-subtle overflow-hidden bg-surface"
            dangerouslySetInnerHTML={{ __html: renderOledCloseup() }}
          />
        </div>
      )}
    </div>
  );
}

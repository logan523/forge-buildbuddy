"use client";

/**
 * Real-node drag editor: each part is an SVG <g> with pointer handlers.
 * NOT overlay labels on a string SVG (that approach failed).
 */
import { useCallback, useRef, useState } from "react";
import type { FormLayerId, FormLayoutOffset, FormSpec } from "@/lib/product-visual/formspec/types";

const W = 480;
const H = 320;

type LayerDef = {
  id: FormLayerId;
  label: string;
  /** Default center position */
  x: number;
  y: number;
  render: (hi: boolean) => React.ReactNode;
};

const LAYERS: LayerDef[] = [
  {
    id: "base",
    label: "Base",
    x: 240,
    y: 270,
    render: () => (
      <ellipse cx={0} cy={0} rx={110} ry={28} fill="#d4b483" stroke="#8b6914" strokeWidth={2} />
    ),
  },
  {
    id: "frame",
    label: "Frame",
    x: 240,
    y: 140,
    render: () => (
      <rect x={-85} y={-50} width={170} height={100} fill="none" stroke="#b8860b" strokeWidth={6} rx={4} />
    ),
  },
  {
    id: "face",
    label: "Screen",
    x: 240,
    y: 135,
    render: (hi) => (
      <>
        <rect
          x={-60}
          y={-32}
          width={120}
          height={64}
          rx={4}
          fill="#0b1220"
          stroke={hi ? "#0891b2" : "#1e293b"}
          strokeWidth={hi ? 3 : 2}
        />
        <text x={0} y={6} textAnchor="middle" fill="#67e8f9" fontSize={16} fontFamily="ui-monospace,monospace" fontWeight={700}>
          12:42
        </text>
      </>
    ),
  },
  {
    id: "wings",
    label: "Solar L",
    x: 95,
    y: 120,
    render: () => (
      <rect x={-40} y={-28} width={80} height={56} rx={3} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
    ),
  },
  {
    id: "brain",
    label: "MCU",
    x: 220,
    y: 200,
    render: () => (
      <rect x={-28} y={-16} width={56} height={32} rx={2} fill="#14532d" stroke="#166534" strokeWidth={1.5} />
    ),
  },
  {
    id: "sensor",
    label: "Sensor",
    x: 290,
    y: 200,
    render: () => (
      <rect x={-16} y={-14} width={32} height={28} rx={2} fill="#ecfdf5" stroke="#059669" strokeWidth={1.5} />
    ),
  },
  {
    id: "touch",
    label: "Button",
    x: 240,
    y: 55,
    render: (hi) => (
      <>
        <circle cx={0} cy={0} r={16} fill="#ede9fe" stroke={hi ? "#0891b2" : "#7c3aed"} strokeWidth={hi ? 3 : 2} />
        <circle cx={0} cy={0} r={8} fill="#a78bfa" opacity={0.7} />
      </>
    ),
  },
  {
    id: "power",
    label: "Battery",
    x: 240,
    y: 245,
    render: () => (
      <rect x={-45} y={-12} width={90} height={24} rx={10} fill="#334155" stroke="#1e293b" strokeWidth={1.5} />
    ),
  },
];

// Second wing as fixed relative visual only drawn with wings layer
function SolarRight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x={-40} y={-28} width={80} height={56} rx={3} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
    </g>
  );
}

const PRESETS: { label: string; layout: Partial<Record<FormLayerId, FormLayoutOffset>> }[] = [
  { label: "Button top", layout: { touch: { x: 0, y: 0 } } },
  { label: "Button left", layout: { touch: { x: -90, y: 70 } } },
  { label: "Button right", layout: { touch: { x: 90, y: 70 } } },
];

export function ProductLayoutEditor({
  layout: initialLayout,
  onLayoutChange,
}: {
  layout?: FormSpec["layout"];
  onLayoutChange?: (layout: NonNullable<FormSpec["layout"]>) => void;
}) {
  const [layout, setLayout] = useState<NonNullable<FormSpec["layout"]>>(initialLayout || {});
  const [selected, setSelected] = useState<FormLayerId | null>("touch");
  const drag = useRef<{
    id: FormLayerId;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const commit = useCallback(
    (next: NonNullable<FormSpec["layout"]>) => {
      setLayout(next);
      onLayoutChange?.(next);
    },
    [onLayoutChange]
  );

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onDown = (id: FormLayerId, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const layer = LAYERS.find((l) => l.id === id)!;
    const off = layout[id] || { x: 0, y: 0 };
    drag.current = {
      id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: off.x,
      origY: off.y,
    };
    setSelected(id);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const start = clientToSvg(drag.current.startClientX, drag.current.startClientY);
    const now = clientToSvg(e.clientX, e.clientY);
    const dx = now.x - start.x;
    const dy = now.y - start.y;
    const id = drag.current.id;
    setLayout((prev) => ({
      ...prev,
      [id]: {
        x: Math.max(-160, Math.min(160, drag.current!.origX + dx)),
        y: Math.max(-160, Math.min(160, drag.current!.origY + dy)),
      },
    }));
  };

  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setLayout((prev) => {
      onLayoutChange?.(prev);
      return prev;
    });
  };

  const pos = (layer: LayerDef) => {
    const o = layout[layer.id] || { x: 0, y: 0 };
    return { x: layer.x + o.x, y: layer.y + o.y };
  };

  const wingsPos = pos(LAYERS.find((l) => l.id === "wings")!);

  return (
    <div className="rounded-xl border border-border-subtle bg-surface overflow-hidden">
      <div className="px-3 py-2 flex flex-wrap gap-1.5 items-center border-b border-border-subtle">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mr-1">
          Drag parts
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className="text-[10px] px-2 py-1 rounded-md border border-border-subtle hover:border-accent text-text-secondary cursor-pointer"
            onClick={() => commit({ ...layout, ...p.layout })}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          className="text-[10px] px-2 py-1 rounded-md border border-border-subtle text-text-muted cursor-pointer ml-auto"
          onClick={() => commit({})}
        >
          Reset
        </button>
      </div>
      <p className="px-3 py-1 text-[11px] text-text-muted">
        Drag the shapes themselves (not floating tags). Selected:{" "}
        <strong className="text-text">{selected || "—"}</strong>
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none bg-[#f4f1eb]"
        style={{ minHeight: 240 }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <ellipse cx={240} cy={295} rx={140} ry={14} fill="#e7e5e4" opacity={0.7} />
        {/* Right solar mirrors left wing offset */}
        <SolarRight x={W - wingsPos.x} y={wingsPos.y} />
        {LAYERS.map((layer) => {
          const { x, y } = pos(layer);
          const hi = selected === layer.id;
          return (
            <g
              key={layer.id}
              transform={`translate(${x},${y})`}
              style={{ cursor: "grab" }}
              onPointerDown={(e) => onDown(layer.id, e)}
            >
              {layer.render(hi)}
              <text
                y={layer.id === "touch" ? -22 : 28}
                textAnchor="middle"
                fontSize={9}
                fill={hi ? "#0891b2" : "#64748b"}
                fontFamily="system-ui,sans-serif"
                fontWeight={hi ? 700 : 500}
                style={{ pointerEvents: "none" }}
              >
                {layer.label}
              </text>
              {/* invisible hit pad */}
              <rect
                x={-50}
                y={-40}
                width={100}
                height={80}
                fill="transparent"
                style={{ cursor: "grab" }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

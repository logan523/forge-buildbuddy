"use client";

/**
 * StageApp — the Stage orchestrator (S0 scope: scene, deterministic camera,
 * selection, studio staging). Grows the assembly director (S1), exact wiring
 * (S2), and the full app seam (S4) in later slices.
 */
import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { buildProductScene3D, type QualityTier } from "@/lib/product-3d";
import { solveShot, type ShotId } from "@/lib/stage/shots";
import { StageCanvas } from "./stage-canvas";
import { CameraRig } from "./camera-rig";
import { PartsLayer } from "./parts-layer";
import { EnvStudio } from "./env-studio";
import { CommitPing } from "./stage-invalidate";

const QUICK_SHOTS: ShotId[] = ["hero", "table", "overhead"];

export function StageApp({
  plan,
  initialShot = "hero",
  className = "",
  style,
  debugHud = false,
}: {
  plan: BuildPlan;
  initialShot?: ShotId;
  className?: string;
  /** Explicit size wins over class chains — percentage heights can measure 0
      on cold mount and stall R3F's container-gated loop start. */
  style?: React.CSSProperties;
  /** /dev/stage chrome: tier + shot chips. Off in-app. */
  debugHud?: boolean;
}) {
  const scene = useMemo(() => buildProductScene3D(plan), [plan]);
  const [shotId, setShotId] = useState<ShotId>(initialShot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tier, setTier] = useState<QualityTier>("medium");

  const shot = useMemo(
    () => solveShot(shotId, scene.nodes, scene.rootScale),
    [shotId, scene]
  );

  const handleSelect = (id: string) => {
    if (selectedId === id) {
      // Second tap on the same part frames it — deterministic part shot.
      setShotId(`part:${id}`);
    } else {
      setSelectedId(id);
    }
  };

  const handleMiss = () => {
    setSelectedId(null);
    setShotId("hero");
  };

  return (
    <div className={`relative ${className}`} style={style}>
      <StageCanvas
        className="h-full w-full"
        onTierChange={setTier}
        onPointerMissed={handleMiss}
      >
        <EnvStudio />
        <PartsLayer
          nodes={scene.nodes}
          rootScale={scene.rootScale}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        {/* Idle orbit stays off on the debug/design-review surface — screenshots
            must be reproducible. In-app it's the idle showcase (off when a part
            is selected so inspection stays put). */}
        <CameraRig shot={shot} idleOrbit={!debugHud && !selectedId} />
        {/* Fires exactly when this suspense scope (HDRI + GLBs) commits —
            the demand-loop's "content arrived, draw it" signal. */}
        <CommitPing />
      </StageCanvas>

      {debugHud && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 font-mono text-[11px]">
          <span className="px-2 py-1 rounded-md bg-black/70 text-cyan-200">
            stage · {tier} · {shot.id}
          </span>
          {QUICK_SHOTS.map((s) => (
            <button
              key={s}
              onClick={() => setShotId(s)}
              className={`px-2 py-1 rounded-md border ${
                shotId === s
                  ? "bg-cyan-500/20 border-cyan-400 text-cyan-100"
                  : "bg-black/50 border-white/20 text-white/80"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

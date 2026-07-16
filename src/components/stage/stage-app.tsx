"use client";

/**
 * StageApp — the Stage orchestrator.
 *
 * S0: scene, deterministic camera, selection, studio staging.
 * S1: assembly timeline — a recipe exists for EVERY project (hand-authored
 *     override or derived), driving piece-by-piece build-up/tear-down with
 *     ghost fit-targets and per-phase camera shots.
 */
import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import {
  applyFrameToNodes,
  buildProductScene3D,
  cadCameraForNodes,
  resolveAssemblyFrame,
  type QualityTier,
} from "@/lib/product-3d";
import { resolveAssemblyRecipe } from "@/lib/stage/derive-recipe";
import { solveShot, type ShotId, type StageShot } from "@/lib/stage/shots";
import { StageCanvas } from "./stage-canvas";
import { CameraRig } from "./camera-rig";
import { PartsLayer } from "./parts-layer";
import { EnvStudio } from "./env-studio";
import { GhostLayer } from "./overlay-layer";
import { AssemblyDirector } from "./assembly-director";
import { CommitPing } from "./stage-invalidate";

const QUICK_SHOTS: ShotId[] = ["hero", "table", "overhead"];

export type StageMode = "overview" | "assemble";

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
  const recipe = useMemo(() => resolveAssemblyRecipe(scene, plan), [scene, plan]);

  const [mode, setMode] = useState<StageMode>("overview");
  const [shotId, setShotId] = useState<ShotId>(initialShot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tier, setTier] = useState<QualityTier>("medium");
  const [scrub, setScrub] = useState(0);
  const [playing, setPlaying] = useState(false);

  const frame = useMemo(() => resolveAssemblyFrame(recipe, scrub), [recipe, scrub]);

  // Assemble mode: positions come from the timeline (joint offsets), presence
  // hides parts that haven't arrived, ghosts preview the next phase's fits.
  const displayNodes = useMemo(() => {
    if (mode !== "assemble") return scene.nodes;
    const present = new Set(frame.presentNodeIds);
    return applyFrameToNodes(scene.nodes, recipe, frame).filter((n) => present.has(n.id));
  }, [mode, scene, recipe, frame]);

  // Camera: assemble mode frames the assembly-so-far each phase — the authored
  // cameraHint contributes its viewing DIRECTION (per-phase intent), but the
  // fit is always solved against the parts actually present, so hand hints
  // written for another viewer can never frame inside the product. Keyed on
  // integer phase → one glide per phase, not per scrub tick.
  const shot: StageShot = useMemo(() => {
    if (mode === "assemble") {
      const present = new Set(frame.presentNodeIds);
      const presentNodes = scene.nodes.filter((n) => present.has(n.id));
      const subject = presentNodes.length ? presentNodes : scene.nodes;
      let dir: [number, number, number] | undefined;
      if (frame.cameraHint) {
        const d: [number, number, number] = [
          frame.cameraHint.position[0] - frame.cameraHint.target[0],
          frame.cameraHint.position[1] - frame.cameraHint.target[1],
          frame.cameraHint.position[2] - frame.cameraHint.target[2],
        ];
        if (Math.hypot(...d) > 1e-6) dir = d;
      }
      const f = cadCameraForNodes(subject, scene.rootScale, 1.25, 0.9, dir);
      return {
        id: `phase:${frame.phaseIndex}` as ShotId,
        position: f.position,
        target: f.target,
        fov: 38,
      };
    }
    return solveShot(shotId, scene.nodes, scene.rootScale);
  }, [mode, frame.phaseIndex, frame.presentNodeIds, frame.cameraHint, shotId, scene]);

  const handleSelect = (id: string) => {
    if (selectedId === id) {
      setShotId(`part:${id}`); // second tap frames the part
    } else {
      setSelectedId(id);
    }
  };

  const handleMiss = () => {
    setSelectedId(null);
    if (mode === "overview") setShotId("hero");
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
          nodes={displayNodes}
          rootScale={scene.rootScale}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        {mode === "assemble" && (
          <GhostLayer scene={scene} recipe={recipe} frame={frame} />
        )}
        <CameraRig
          shot={shot}
          idleOrbit={!debugHud && !selectedId && mode === "overview"}
        />
        {/* Fires exactly when this suspense scope (HDRI + GLBs) commits —
            the demand-loop's "content arrived, draw it" signal. */}
        <CommitPing />
      </StageCanvas>

      {/* Mode chips (always) + debug chrome (dev only) */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 font-mono text-[11px]">
        {debugHud && (
          <span className="px-2 py-1 rounded-md bg-black/70 text-cyan-200">
            stage · {tier} · {shot.id}
          </span>
        )}
        {(["overview", "assemble"] as StageMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setPlaying(false);
              if (m === "assemble") setScrub(0);
              if (m === "overview") setShotId("hero");
            }}
            className={`px-2 py-1 rounded-md border ${
              mode === m
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-100"
                : "bg-black/50 border-white/20 text-white/80"
            }`}
          >
            {m}
          </button>
        ))}
        {debugHud &&
          mode === "overview" &&
          QUICK_SHOTS.map((s) => (
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

      {mode === "assemble" && (
        <AssemblyDirector
          recipe={recipe}
          frame={frame}
          scrub={scrub}
          onScrub={setScrub}
          playing={playing}
          onPlayingChange={setPlaying}
        />
      )}
    </div>
  );
}

"use client";

/**
 * StageCanvas — the ONE persistent WebGL host for the Stage.
 *
 * Reliability contract (the "well-oiled machine" floor):
 *  - frameloop="demand": zero GPU burn at rest; all motion goes through the
 *    invalidate bus (stage-invalidate.ts).
 *  - No `camera` prop: CameraRig is the single camera owner (kills the old
 *    two-paths-race that made first frames differ per load).
 *  - Context-loss recovery: webglcontextlost is intercepted (preventDefault
 *    allows restore), a calm overlay shows, webglcontextrestored resumes.
 *  - WebGL-unavailable → friendly fallback instead of a dead black box.
 *  - <Preload all /> warms every suspended asset (GLBs, HDRI) after mount.
 *  - Quality tiers with runtime demote/promote (60s hysteresis, capped at the
 *    device's detected tier).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Preload, useProgress } from "@react-three/drei";
import {
  detectQualityTier,
  qualitySettings,
  type QualityTier,
} from "@/lib/product-3d";
import { bindStageInvalidate, invalidateStage } from "./stage-invalidate";
import { StagePostFx } from "./postfx";

const TIER_ORDER: QualityTier[] = ["low", "medium", "high"];

function webglAvailable(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Inside-Canvas bridge: binds the module invalidate bus + context-loss events. */
function CanvasLifecycle({ onLost }: { onLost: (lost: boolean) => void }) {
  const { gl, invalidate } = useThree();
  useEffect(() => bindStageInvalidate(() => invalidate()), [invalidate]);
  // Demand-loop cold start: suspended assets (HDRI, GLBs) resolving does NOT
  // invalidate on its own — the first real paint must be requested. Fire when
  // the loader goes quiet, plus two settle ticks as a belt for cached loads.
  const loading = useProgress((s) => s.active);
  useEffect(() => {
    if (!loading) invalidate();
  }, [loading, invalidate]);
  useEffect(() => {
    const t1 = setTimeout(() => invalidate(), 120);
    const t2 = setTimeout(() => invalidate(), 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [invalidate]);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      // preventDefault tells the browser we intend to handle restoration.
      e.preventDefault();
      onLost(true);
    };
    const restored = () => {
      onLost(false);
      invalidate();
    };
    el.addEventListener("webglcontextlost", lost, false);
    el.addEventListener("webglcontextrestored", restored, false);
    return () => {
      el.removeEventListener("webglcontextlost", lost, false);
      el.removeEventListener("webglcontextrestored", restored, false);
    };
  }, [gl, onLost, invalidate]);
  return null;
}

export function StageCanvas({
  children,
  className = "",
  onTierChange,
  onPointerMissed,
  minHeight = 320,
}: {
  children: ReactNode;
  className?: string;
  /** Surfaced so HUD/debug chrome can show the live tier. */
  onTierChange?: (tier: QualityTier) => void;
  /** Click on empty space (deselect affordance). */
  onPointerMissed?: () => void;
  /** Zero-height-mount guard floor; embedders with a deterministic compact
      height (mobile peek strip) pass a lower value. */
  minHeight?: number;
}) {
  const [available] = useState(webglAvailable);
  const [contextLost, setContextLost] = useState(false);
  const initialTier = useMemo(() => detectQualityTier(), []);
  const initialTierRef = useRef(initialTier);
  const [tier, setTier] = useState<QualityTier>(initialTier);
  const lastTierChange = useRef(0);
  const quality = qualitySettings(tier);

  useEffect(() => {
    onTierChange?.(tier);
  }, [tier, onTierChange]);

  // Runtime demote/promote with 60s hysteresis, never above the detected tier.
  const shiftTier = (dir: 1 | -1) => {
    const now = Date.now();
    if (now - lastTierChange.current < 60_000) return;
    setTier((cur) => {
      const idx = TIER_ORDER.indexOf(cur) + dir;
      const capped = Math.min(
        TIER_ORDER.indexOf(initialTierRef.current),
        Math.max(0, idx)
      );
      const next = TIER_ORDER[capped];
      if (next !== cur) lastTierChange.current = now;
      return next ?? cur;
    });
    invalidateStage();
  };

  // Cold-mount measurement kick: R3F gates its loop start on a nonzero
  // container measurement (react-use-measure). Some layouts resolve their
  // height a beat after mount and the observer misses it — the canvas then
  // sits at 300x150 with invalidate() swallowed forever. One synthetic resize
  // after layout settles forces a remeasure; harmless when sizing was fine.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
    return () => clearTimeout(t);
  }, []);

  if (!available) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-500 text-sm rounded-xl ${className}`}
      >
        3D isn&apos;t available on this device — use the 2D product view instead.
      </div>
    );
  }

  return (
    // Inline size floor: if an ancestor chain ever resolves to 0 height at
    // mount, minHeight keeps the measurement nonzero so R3F's loop always
    // starts; ResizeObserver then tracks the real layout. Embedders with a
    // deterministic small height (mobile peek strip) pass a lower floor —
    // the guard must never OVERRIDE an explicitly requested compact size.
    <div
      className={`relative ${className}`}
      style={{ width: "100%", height: "100%", minHeight }}
    >
      <Canvas
        // TODO(S4-perf): return to frameloop="demand". The invalidate bus +
        // CommitPing plumbing is already wired throughout; under StrictMode the
        // demand loop presented no frames after suspense resolution despite
        // frames executing at full drawbuffer size (instrumented). "always"
        // matches the current production viewer's behavior — no regression —
        // while the demand investigation continues with fresh eyes.
        frameloop="always"
        dpr={quality.dpr}
        shadows
        gl={{ antialias: quality.antialias, powerPreference: "high-performance" }}
        onPointerMissed={onPointerMissed}
        // NO camera prop on purpose — CameraRig owns the camera entirely.
      >
        <CanvasLifecycle onLost={setContextLost} />
        <PerformanceMonitor
          onDecline={() => shiftTier(-1)}
          onIncline={() => shiftTier(1)}
        />
        {children}
        <StagePostFx tier={tier} />
        <Preload all />
      </Canvas>
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-slate-100 text-sm rounded-xl">
          Restarting 3D…
        </div>
      )}
    </div>
  );
}

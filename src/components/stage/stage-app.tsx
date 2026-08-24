"use client";

/**
 * StageApp — the Stage orchestrator and the app's 3D seam.
 *
 * Replaces ProductAssemblyApp with the SAME outward contract:
 *   { plan, stepIndex, step, height, expandable, onPlanPatch, className,
 *     variant, expanded, onExpandedChange, focusWire }
 * so product-hero / step-hero swap with a one-line mount change.
 *
 * Modes: overview (hero product) · assemble (piece-by-piece timeline with
 * ghost fit-targets) · wire (spread wiring map, labeled pads). In step
 * chrome (variant="step", collapsed) the current build step drives the stage:
 * presence via scrubForStep, DEFAULT isolation to the step's focus parts (not
 * the full product), camera on those parts, and the guided micro-step
 * (focusWire) lights exactly one wire with a pin-level camera.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { BuildPlan, MicroStep } from "@/lib/types";
import {
  applyFrameToNodes,
  buildAssemblyTree,
  buildProductScene3D,
  cadCameraForNodes,
  frameForNodeIds,
  frameForPin,
  pinStubsForNode,
  resolveAssemblyFrame,
  scrubForStep,
  wireDisplayLabel,
  wireLegend,
  wireRouteForNodes,
  wiresForPart,
  type AssemblyTreeNode,
  type LayerViewState,
  type QualityTier,
  type SceneNode3D,
} from "@/lib/product-3d";
import { explainNode } from "@/lib/steps/explain-part";
import { resolveAssemblyRecipe } from "@/lib/stage/derive-recipe";
import { buildWirePlan } from "@/lib/stage/wire-plan";
import {
  filterNodesForIsolation,
  filterWiresForIsolation,
  isolateNodeIds,
  isolatePartIds,
} from "@/lib/stage/step-isolation";
import { solveShot, type ShotId, type StageShot } from "@/lib/stage/shots";
import { ConformanceSeal } from "./conformance-seal";
import { StageCanvas } from "./stage-canvas";
import { CameraRig } from "./camera-rig";
import { PartsLayer } from "./parts-layer";
import { EnvStudio } from "./env-studio";
import { GhostLayer } from "./overlay-layer";
import { AssemblyDirector } from "./assembly-director";
import { WiringLayer } from "./wiring-layer";
import { CommitPing } from "./stage-invalidate";

export type StageMode = "overview" | "assemble" | "wire";

/** Minimal LayerViewState for pin math (stage doesn't explode via view). */
const FLAT_VIEW: LayerViewState = {
  visible: {},
  soloLayerId: null,
  explode: 0,
  selectedNodeId: null,
};

function TreeRows({
  node,
  depth,
  onPick,
}: {
  node: AssemblyTreeNode;
  depth: number;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <button
        onClick={() => onPick(node.id)}
        className="block w-full text-left px-2 py-1 rounded text-xs text-text-secondary hover:bg-surface-hover truncate"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.label}
      </button>
      {node.children.map((c) => (
        <TreeRows key={c.id} node={c} depth={depth + 1} onPick={onPick} />
      ))}
    </>
  );
}

export function StageApp({
  plan,
  stepIndex = "prep",
  step,
  height = 920,
  expandable = true,
  onPlanPatch: _onPlanPatch,
  className = "",
  variant = "full",
  expanded: expandedProp,
  onExpandedChange,
  focusWire = null,
  initialShot = "hero",
  style,
  debugHud = false,
}: {
  plan: BuildPlan;
  stepIndex?: number | "prep";
  step?: {
    title?: string;
    description?: string;
    mediaKind?: string;
    stepNumber?: number;
    compiled?: {
      focusPartIds?: string[];
      connections?: { fromLabel?: string; toLabel?: string }[];
    };
  };
  height?: number;
  expandable?: boolean;
  onPlanPatch?: (patch: Partial<BuildPlan>) => void;
  className?: string;
  variant?: "full" | "step";
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  focusWire?: MicroStep | null;
  initialShot?: ShotId;
  style?: CSSProperties;
  debugHud?: boolean;
}) {
  const scene = useMemo(() => buildProductScene3D(plan), [plan]);
  const recipe = useMemo(() => resolveAssemblyRecipe(scene, plan), [scene, plan]);
  const tree = useMemo(() => buildAssemblyTree(scene, plan.title), [scene, plan.title]);

  // Wire mode spreads bodies from the centroid; harness re-routes against the
  // spread positions so tubes still land on pins.
  const spreadScene = useMemo(() => {
    const n = scene.nodes.length || 1;
    const cx = scene.nodes.reduce((s, x) => s + x.position[0], 0) / n;
    const cy = scene.nodes.reduce((s, x) => s + x.position[1], 0) / n;
    const cz = scene.nodes.reduce((s, x) => s + x.position[2], 0) / n;
    const SPREAD = 1.55;
    return {
      ...scene,
      nodes: scene.nodes.map((x) => ({
        ...x,
        position: [
          cx + (x.position[0] - cx) * SPREAD,
          cy + (x.position[1] - cy) * SPREAD,
          cz + (x.position[2] - cz) * SPREAD,
        ] as [number, number, number],
      })),
    };
  }, [scene]);

  const wirePlan = useMemo(() => buildWirePlan(scene, plan, recipe), [scene, plan, recipe]);
  const wirePlanSpread = useMemo(
    () => buildWirePlan(spreadScene, plan, recipe),
    [spreadScene, plan, recipe]
  );

  const [expandedState, setExpandedState] = useState(false);
  const expanded = expandedProp ?? expandedState;
  const setExpanded = (v: boolean) => {
    setExpandedState(v);
    onExpandedChange?.(v);
  };
  const stepChrome = variant === "step" && !expanded;

  const [mode, setMode] = useState<StageMode>("overview");
  const [shotId, setShotId] = useState<ShotId>(initialShot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [activeWireId, setActiveWireId] = useState<string | null>(null);
  const [showWires, setShowWires] = useState(true);
  const [showTree, setShowTree] = useState(false);
  const [tier, setTier] = useState<QualityTier>("medium");
  const [scrub, setScrub] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Step chrome: the build step owns presence — placement steps show
  // assembly-so-far (scrubForStep); wiring steps keep full-phase presence
  // then ISOLATE down to the focus parts (default workbench view).
  const stepScrub = useMemo(() => {
    if (!stepChrome || stepIndex === "prep") return null;
    return scrubForStep(recipe, step, stepIndex as number, plan.steps?.length ?? 1);
  }, [stepChrome, stepIndex, step, recipe, plan.steps?.length]);

  const effectiveScrub =
    stepScrub != null ? stepScrub : mode === "assemble" ? scrub : recipe.phases.length - 1;
  const frame = useMemo(
    () => resolveAssemblyFrame(recipe, effectiveScrub),
    [recipe, effectiveScrub]
  );

  // Isolation set for step chrome — guided wire endpoints win over step focus.
  const stepIsolateNodeIds = useMemo(() => {
    if (!stepChrome) return null;
    const partIds = isolatePartIds(step?.compiled?.focusPartIds, focusWire);
    if (!partIds?.length) return null;
    const ids = isolateNodeIds(scene.nodes, partIds);
    return ids.length ? ids : null;
  }, [stepChrome, step?.compiled?.focusPartIds, focusWire, scene.nodes]);

  const displayNodes = useMemo(() => {
    if (mode === "wire" && !stepChrome) return spreadScene.nodes;
    let nodes: SceneNode3D[];
    if (mode === "assemble" || stepScrub != null) {
      const present = new Set(frame.presentNodeIds);
      nodes = applyFrameToNodes(scene.nodes, recipe, frame).filter((n) => present.has(n.id));
    } else {
      nodes = scene.nodes;
    }
    // Default: hide everything this step isn't about.
    if (stepIsolateNodeIds) {
      nodes = filterNodesForIsolation(nodes, stepIsolateNodeIds);
    }
    return nodes;
  }, [mode, stepChrome, stepScrub, scene, spreadScene, recipe, frame, stepIsolateNodeIds]);

  const nodeById = useMemo(
    () => new Map(scene.nodes.map((n) => [n.id, n])),
    [scene.nodes]
  );

  // Guided micro-step ("show me"): light exactly this wire + frame its pin.
  const focusWireRoute = useMemo(() => {
    if (!focusWire) return null;
    return wireRouteForNodes(
      wirePlan.wires.map((w) => w.route),
      focusWire.fromPartId,
      focusWire.toPartId
    );
  }, [focusWire, wirePlan]);

  // Step chrome: only the wires that belong to the isolated parts.
  const displayWirePlan = useMemo(() => {
    if (!stepChrome || !stepIsolateNodeIds) return wirePlan;
    return {
      ...wirePlan,
      wires: filterWiresForIsolation(wirePlan.wires, stepIsolateNodeIds),
    };
  }, [stepChrome, stepIsolateNodeIds, wirePlan]);

  useEffect(() => {
    setActiveWireId(focusWireRoute?.id ?? null);
  }, [focusWireRoute]);

  // Camera — one deterministic shot per state, priority:
  // pin (guided wire) > isolate > step focus (tight) > mode shots.
  const shot: StageShot = useMemo(() => {
    if (focusWire && focusWireRoute) {
      const destNode = focusWire.toPartId
        ? scene.nodes.find(
            (n) => n.partId === focusWire.toPartId || n.id === focusWire.toPartId
          )
        : undefined;
      const pin = destNode
        ? frameForPin(destNode, focusWire.toPin, FLAT_VIEW, scene.rootScale, 0.55)
        : null;
      if (pin) {
        return {
          id: `part:pin-${focusWire.id}` as ShotId,
          position: pin.position,
          target: pin.target,
          fov: pin.fov,
        };
      }
      // Pin resolve failed — frame the two parts of the wire, not the whole board.
      if (stepIsolateNodeIds?.length) {
        const f = frameForNodeIds(displayNodes, stepIsolateNodeIds, scene.rootScale, 1.1);
        return {
          id: `part:wire-${focusWire.id}` as ShotId,
          position: f.position,
          target: f.target,
          fov: f.fov,
        };
      }
    }
    if (isolatedId) return solveShot(`part:${isolatedId}`, displayNodes, scene.rootScale);
    if (stepChrome && stepIsolateNodeIds?.length) {
      // Tight isolation framing (1.1 margin) — kitchen-table pin work, not hero.
      const f = frameForNodeIds(displayNodes, stepIsolateNodeIds, scene.rootScale, 1.1);
      return {
        id: `part:step-${stepIndex}` as ShotId,
        position: f.position,
        target: f.target,
        fov: Math.min(f.fov, 36),
      };
    }
    if (mode === "assemble" && stepScrub == null) {
      const present = new Set(frame.presentNodeIds);
      const subject = scene.nodes.filter((n) => present.has(n.id));
      let dir: [number, number, number] | undefined;
      if (frame.cameraHint) {
        const d: [number, number, number] = [
          frame.cameraHint.position[0] - frame.cameraHint.target[0],
          frame.cameraHint.position[1] - frame.cameraHint.target[1],
          frame.cameraHint.position[2] - frame.cameraHint.target[2],
        ];
        if (Math.hypot(...d) > 1e-6) dir = d;
      }
      const f = cadCameraForNodes(subject.length ? subject : scene.nodes, scene.rootScale, 1.25, 0.9, dir);
      return { id: `phase:${frame.phaseIndex}` as ShotId, position: f.position, target: f.target, fov: 38 };
    }
    if (mode === "wire" && !stepChrome) {
      return solveShot("map", spreadScene.nodes, spreadScene.rootScale);
    }
    return solveShot(shotId, scene.nodes, scene.rootScale);
  }, [
    focusWire, focusWireRoute, nodeById, isolatedId, stepChrome, stepIsolateNodeIds, stepIndex,
    mode, stepScrub, frame, shotId, scene, spreadScene, displayNodes,
  ]);

  const focusId = isolatedId ?? selectedId;
  const focusNode = focusId ? nodeById.get(focusId) : undefined;
  const focusWires = useMemo(
    () => (focusId ? wiresForPart(wirePlan.wires.map((w) => w.route), focusId).slice(0, 8) : []),
    [focusId, wirePlan]
  );
  const explanation = useMemo(() => {
    if (!focusNode) return null;
    return explainNode(
      focusNode.id,
      focusNode.label,
      focusWires.map((w) => ({
        netClass: w.netClass,
        netName: w.netName,
        otherLabel:
          nodeById.get(w.fromNodeId === focusNode.id ? w.toNodeId : w.fromNodeId)?.label ??
          "another part",
      }))
    );
  }, [focusNode, focusWires, nodeById]);

  const clearFocus = () => {
    setSelectedId(null);
    setIsolatedId(null);
    setActiveWireId(null);
  };

  // Esc → Reassemble (matches the old viewer's affordance)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId((cur) => (cur === id ? cur : id));
    if (selectedId === id) setIsolatedId(id); // second tap = inspect
  };

  const handleMiss = () => {
    clearFocus();
    if (mode === "overview") setShotId("hero");
  };

  const shellStyle: CSSProperties = expanded
    ? { position: "fixed", inset: 0, zIndex: 50, background: "var(--color-bg)" }
    : { height, ...style };

  return (
    <div className={`relative ${className}`} style={shellStyle}>
      <StageCanvas
        className="h-full w-full"
        onTierChange={setTier}
        onPointerMissed={handleMiss}
        // The zero-height guard must not override an explicitly compact embed
        // (mobile peek strip passes height < 320).
        minHeight={expanded ? 320 : Math.min(320, height)}
      >
        <EnvStudio />
        <PartsLayer
          nodes={displayNodes}
          rootScale={scene.rootScale}
          selectedId={focusId}
          onSelect={handleSelect}
          isolatedId={isolatedId}
        />
        {showWires && (
          <WiringLayer
            plan={
              mode === "wire" && !stepChrome
                ? wirePlanSpread
                : stepChrome
                  ? displayWirePlan
                  : wirePlan
            }
            recipe={recipe}
            rootScale={scene.rootScale}
            scrub={effectiveScrub}
            showPads={mode === "wire" && !stepChrome}
            activeWireId={activeWireId}
            onWireTap={setActiveWireId}
          />
        )}
        {mode === "assemble" && stepScrub == null && (
          <GhostLayer scene={scene} recipe={recipe} frame={frame} />
        )}
        <CameraRig
          shot={shot}
          idleOrbit={!debugHud && !focusId && mode === "overview" && !stepChrome}
        />
        <CommitPing />
      </StageCanvas>

      {/* Top chrome: mode chips + wires + tree + expand (token chips, 12px floor) */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 font-mono text-xs">
        {debugHud && (
          <span className="px-2 py-1 rounded-md bg-console-overlay text-console-accent">
            stage · {tier} · {shot.id}
          </span>
        )}
        {!stepChrome &&
          (["overview", "assemble", "wire"] as StageMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setPlaying(false);
                setActiveWireId(null);
                if (m === "assemble") setScrub(0);
                if (m === "overview") setShotId("hero");
              }}
              className={`px-2 py-1 rounded-md border ${
                mode === m
                  ? "bg-accent border-accent text-white"
                  : "bg-surface/90 border-border text-text-secondary"
              }`}
            >
              {m}
            </button>
          ))}
        {!stepChrome && (
          <>
            <button
              onClick={() => setShowWires((v) => !v)}
              className={`px-2 py-1 rounded-md border ${
                showWires
                  ? "bg-accent border-accent text-white"
                  : "bg-surface/90 border-border text-text-secondary"
              }`}
            >
              Wires
            </button>
            {/* Parts tree is an explorer affordance — it only ships in the
                expanded (Full) stage, never over the inline step view. */}
            {expanded && (
              <button
                onClick={() => setShowTree((v) => !v)}
                className={`px-2 py-1 rounded-md border ${
                  showTree
                    ? "bg-accent border-accent text-white"
                    : "bg-surface/90 border-border text-text-secondary"
                }`}
              >
                Parts
              </button>
            )}
          </>
        )}
        {isolatedId && (
          <button
            onClick={clearFocus}
            className="px-2 py-1 rounded-md border bg-warning-soft border-warning/40 text-warning"
          >
            Reassemble
          </button>
        )}
        {expandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1 rounded-md border bg-surface/90 border-border text-text-secondary"
          >
            {expanded ? "Close" : "Full"}
          </button>
        )}
      </div>

      {/* Parts tree (expanded stage only — see the Parts button gate above) */}
      {expanded && showTree && !stepChrome && (
        <div className="absolute top-12 left-3 z-10 w-56 max-h-[60%] overflow-y-auto rounded-lg bg-surface-raised/95 border border-border-subtle shadow-card p-2">
          <div className="px-2 pb-1 text-xs uppercase tracking-widest text-text-muted">
            Parts
          </div>
          <TreeRows node={tree} depth={0} onPick={(id) => {
            const n = nodeById.get(id);
            if (n) {
              setSelectedId(id);
              setIsolatedId(id);
            }
          }} />
        </div>
      )}

      {/* Selection / inspect card — expanded stage only; the inline step view
          keeps its attention on the isolated parts + the guided wire. */}
      {expanded && focusNode && explanation && (
        <div className="absolute bottom-3 left-3 z-10 max-w-sm rounded-xl bg-surface-raised/95 border border-border-subtle shadow-card px-4 py-3 text-text">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[13px] font-semibold">
              {focusNode.label}
              {isolatedId ? " · inspect" : ""}
            </div>
            <div className="flex gap-1.5">
              {!isolatedId && (
                <button
                  onClick={() => setIsolatedId(focusNode.id)}
                  className="px-2 py-0.5 rounded text-xs bg-accent border border-accent text-white"
                >
                  Inspect
                </button>
              )}
              <button
                onClick={clearFocus}
                className="px-2 py-0.5 rounded text-xs bg-surface border border-border text-text-secondary"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="mt-1 text-xs text-text-secondary">{explanation.headline}</div>
          {explanation.points.slice(0, 3).map((p, i) => (
            <div key={i} className="text-xs text-text-muted">
              · {p}
            </div>
          ))}
          {focusNode && pinStubsForNode(focusNode).length > 0 && (
            <div className="mt-1 text-xs text-text-muted">
              Pins: {pinStubsForNode(focusNode).map((p) => p.name).join(" · ")}
            </div>
          )}
          {focusWires.length > 0 && (
            <div className="mt-1 text-xs text-text-muted truncate">
              Wires: {focusWires.map((w) => wireDisplayLabel(w)).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Wiring legend — the color authority, verbatim (wire mode) */}
      {mode === "wire" && !stepChrome && (
        <div className="absolute top-3 right-3 z-10 rounded-lg bg-surface-raised/95 border border-border-subtle shadow-card px-3 py-2 space-y-1">
          <div className="text-xs uppercase tracking-widest text-text-muted">
            Wiring · {wirePlan.wires.length}
          </div>
          {wireLegend().map((row) => (
            <div key={row.meaning} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border border-border"
                style={{ background: row.color }}
              />
              {row.meaning}
            </div>
          ))}
        </div>
      )}

      {/* Step isolation chip — confirms the stage is only showing this step's parts */}
      {stepChrome && stepIsolateNodeIds && stepIsolateNodeIds.length > 0 && !focusNode && (
        <div className="absolute bottom-3 left-3 z-10 max-w-[70%] rounded-lg bg-surface/90 border border-border-subtle shadow-card px-2.5 py-1.5 text-xs text-text-secondary font-mono leading-snug">
          <span className="text-accent font-semibold">Isolated</span>
          {" · "}
          {displayNodes.map((n) => n.label).filter(Boolean).slice(0, 3).join(" + ") ||
            `${stepIsolateNodeIds.length} parts`}
          {focusWire ? (
            <span className="block text-text-muted mt-0.5">
              {focusWire.colorName} · {focusWire.fromPin} → {focusWire.toPin}
            </span>
          ) : null}
        </div>
      )}

      {/* Conformance seal (step chrome, nothing inspected) */}
      {stepChrome && !focusNode && (
        <div className="absolute bottom-3 right-3 z-10">
          <ConformanceSeal plan={plan} />
        </div>
      )}

      {mode === "assemble" && stepScrub == null && !stepChrome && (
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

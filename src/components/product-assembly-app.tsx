"use client";

/**
 * Assembly Stage — PRODUCT-FIRST + JARVIS isolate.
 * Double-click / Inspect extracts a part; Reassemble recomposes.
 * Thin chrome only: scrub bar + collapsible tree + selection card.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BuildPlan, CompiledStepFacts } from "@/lib/types";
import {
  buildProductScene3D,
  getRecipeForTemplate,
  resolveAssemblyFrame,
  applyFrameToNodes,
  buildHarnesses,
  wiresForPart,
  wireLegend,
  buildAssemblyTree,
  frameForNodeIds,
  scrubForStep,
  type BeautyMeshSpec,
  type LayerViewState,
  type WireRoute3D,
} from "@/lib/product-3d";
import {
  type AssemblyViewState,
  type AssemblyTreeNode,
  defaultAssemblyView,
  inspectNode,
  selectNode,
  setExplode,
  isolateNode,
  clearIsolate,
  toggleIsolate,
} from "@/lib/product-3d/assembly-view";
import { meshPinStubsForNode } from "@/lib/product-3d/sat-pins";
import { deriveStepPresence } from "@/lib/product-3d/step-presence";
import { ProductViewer3D } from "@/components/product-viewer-3d";

function TreeRows({
  node,
  depth,
  activeId,
  onPick,
}: {
  node: AssemblyTreeNode;
  depth: number;
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  if (node.isGroup && node.id === "__root__") {
    return (
      <>
        {node.children.map((c) => (
          <TreeRows
            key={c.id}
            node={c}
            depth={0}
            activeId={activeId}
            onPick={onPick}
          />
        ))}
      </>
    );
  }
  const active = activeId === node.id;
  return (
    <>
      <button
        type="button"
        onClick={() => onPick(node.id)}
        className={`w-full text-left text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate ${
          active
            ? "bg-cyan-500/30 text-cyan-50"
            : "text-white/55 hover:bg-white/10 hover:text-white/85"
        }`}
        style={{ paddingLeft: 6 + depth * 10 }}
        title={`Inspect ${node.label}`}
      >
        {node.label}
      </button>
      {node.children.map((c) => (
        <TreeRows
          key={c.id}
          node={c}
          depth={depth + 1}
          activeId={activeId}
          onPick={onPick}
        />
      ))}
    </>
  );
}

export function ProductAssemblyApp({
  plan,
  stepIndex = "prep",
  step,
  height = 920,
  expandable = true,
  onPlanPatch,
  className = "",
  variant = "full",
  expanded: expandedProp,
  onExpandedChange,
}: {
  plan: BuildPlan;
  stepIndex?: number | "prep";
  step?: {
    title?: string;
    description?: string;
    mediaKind?: string;
    stepNumber?: number;
    compiled?: CompiledStepFacts;
  };
  height?: number;
  expandable?: boolean;
  onPlanPatch?: (patch: Partial<BuildPlan>) => void;
  className?: string;
  /** "step": minimal chrome (orbit + tap-select + callout) — playground lives behind Expand. */
  variant?: "full" | "step";
  /** Controlled expand (StepHero owns it for Back/Esc semantics). */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const baseScene = useMemo(() => buildProductScene3D(plan), [plan]);
  const recipe = useMemo(
    () => getRecipeForTemplate(baseScene.templateId),
    [baseScene.templateId]
  );
  const maxPhase = recipe ? recipe.phases.length - 1 : 0;

  const initialScrub = useMemo(() => {
    if (!recipe) return maxPhase;
    if (stepIndex === "prep" || typeof stepIndex !== "number") return maxPhase;
    // scrubForStep is the shared rule the render-audit validates against: a
    // wiring step (has focusPartIds) shows the fully-assembled product so the
    // focus camera can zoom to exactly the parts being wired; otherwise fall
    // back to the recipe phase for this step.
    return scrubForStep(recipe, step, stepIndex, plan.steps?.length ?? 1);
  }, [recipe, stepIndex, step, maxPhase, plan.steps?.length]);

  const [scrub, setScrub] = useState(initialScrub);
  const [playing, setPlaying] = useState(false);
  const [expandedState, setExpandedState] = useState(false);
  const expanded = expandedProp ?? expandedState;
  const setExpanded = useCallback(
    (v: boolean) => (onExpandedChange ? onExpandedChange(v) : setExpandedState(v)),
    [onExpandedChange]
  );
  const [treeOpen, setTreeOpen] = useState(variant !== "step");
  // Minimal in-step chrome: a beginner mid-step needs "what goes where",
  // not a timeline scrubber. The expanded stage is the full playground.
  const stepChrome = variant === "step" && !expanded;

  // Reactive viewport height (eng V4: never read innerHeight one-shot).
  const [viewportH, setViewportH] = useState(920);
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Expand quadruples the canvas area — pause the perf monitor through it
  // so the resize dip can't strip effects permanently (eng V3).
  const [expandEpoch, setExpandEpoch] = useState(0);
  useEffect(() => {
    setExpandEpoch((e) => e + 1);
  }, [expanded]);

  useEffect(() => {
    setScrub(initialScrub);
  }, [initialScrub]);

  useEffect(() => {
    if (!playing || !recipe) return;
    const id = setInterval(() => {
      setScrub((s) => {
        const next = s + 0.035;
        if (next >= maxPhase) {
          setPlaying(false);
          return maxPhase;
        }
        return next;
      });
    }, 48);
    return () => clearInterval(id);
  }, [playing, recipe, maxPhase]);

  const frame = useMemo(() => {
    if (!recipe) return null;
    return resolveAssemblyFrame(recipe, scrub);
  }, [recipe, scrub]);

  const framedNodes = useMemo(() => {
    if (!recipe || !frame) return baseScene.nodes;
    return applyFrameToNodes(baseScene.nodes, recipe, frame, 0);
  }, [baseScene.nodes, recipe, frame]);

  // Recipe-less templates: derive per-step presence from step text so the
  // stage builds up over the walk instead of showing the finished product on
  // step 1. Weak matching → null → full product (never wrongly hide).
  const derivedPresence = useMemo(() => {
    if (recipe || stepIndex === "prep") return null;
    return deriveStepPresence(plan, plan.steps || [], baseScene.nodes);
  }, [recipe, stepIndex, plan, baseScene.nodes]);

  const presentNodeIds = useMemo(() => {
    if (frame?.presentNodeIds) return new Set(frame.presentNodeIds);
    if (derivedPresence && step?.stepNumber != null) {
      const fullIndex = (plan.steps || []).findIndex(
        (s) => s.stepNumber === step.stepNumber
      );
      const set = derivedPresence.presentByStep.get(fullIndex);
      if (set) return set;
    }
    return new Set(baseScene.nodes.map((n) => n.id));
  }, [frame, derivedPresence, step?.stepNumber, plan.steps, baseScene.nodes]);

  const presentMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const n of baseScene.nodes) m[n.id] = presentNodeIds.has(n.id);
    return m;
  }, [baseScene.nodes, presentNodeIds]);

  // Structured camera focus: frame EXACTLY the parts this step wires, resolved
  // from the compiled connections (partId join, not title keywords). This is
  // what stops the camera zooming to an unrelated item on wiring steps; it
  // overrides the recipe phase's authored hint whenever we have this truth.
  const focusCamera = useMemo(() => {
    if (!stepChrome) return null;
    const focusIds = step?.compiled?.focusPartIds;
    if (!focusIds?.length) return null;
    const idSet = new Set(focusIds);
    const nodeIds = baseScene.nodes
      .filter((n) => n.partId && idSet.has(n.partId))
      .map((n) => n.id);
    if (!nodeIds.length) return null;
    // Frame against the ASSEMBLED positions (framedNodes), not baseScene —
    // base positions are pre-assembly, so framing those aims at empty space.
    // Tight focus: the diagnostic showed dist to FILL the frame ≈ 0.83 (margin
    // ~0.8); the default loose margin left the small cube far away with the
    // stand/ground filling the space below it. 0.95 fills the frame with a
    // little padding (dist ≈ 1.0 vs the old 1.47).
    const f = frameForNodeIds(framedNodes, nodeIds, baseScene.rootScale, 0.95);
    return { position: f.position, target: f.target };
  }, [stepChrome, step, baseScene.nodes, framedNodes, baseScene.rootScale]);

  const [view, setView] = useState<AssemblyViewState>(() =>
    defaultAssemblyView(baseScene.nodes)
  );

  useEffect(() => {
    setView((v) => ({ ...v, present: presentMap }));
  }, [presentMap]);

  // Clear isolate when phase scrub moves (parts may leave present set)
  useEffect(() => {
    setView((v) => (v.isolateNodeId ? clearIsolate(v) : v));
  }, [scrub]);

  const layerView: LayerViewState = useMemo(
    () => ({
      visible: view.visible,
      soloLayerId: view.soloLayerId,
      explode: view.explode,
      selectedNodeId: view.selectedNodeId,
      nodeVisible: view.nodeVisible,
      present: presentMap,
      section: view.section,
      isolateNodeId: view.isolateNodeId ?? null,
    }),
    [view, presentMap]
  );

  const displayNodes = useMemo(() => {
    if (!recipe || !frame) return framedNodes;
    if (view.explode <= 0) return framedNodes;
    return applyFrameToNodes(baseScene.nodes, recipe, frame, view.explode);
  }, [recipe, frame, framedNodes, baseScene.nodes, view.explode]);

  const harnesses: WireRoute3D[] = useMemo(() => {
    if (!recipe || !frame) return [];
    const hints =
      frame.phaseIndex >= maxPhase
        ? undefined
        : frame.activeNetHints.length
          ? frame.activeNetHints
          : undefined;
    let wires = buildHarnesses(
      { ...baseScene, nodes: displayNodes },
      plan,
      recipe,
      { presentNodeIds: frame.presentNodeIds, activeNetHints: hints }
    );
    // Inspect mode: only incident nets on the extracted part
    if (view.isolateNodeId) {
      wires = wiresForPart(wires, view.isolateNodeId);
    }
    return wires;
  }, [recipe, frame, baseScene, displayNodes, plan, maxPhase, view.isolateNodeId]);

  const onViewChange = useCallback((lv: LayerViewState) => {
    setView((v) => ({
      ...v,
      visible: lv.visible,
      soloLayerId: lv.soloLayerId,
      explode: lv.explode,
      selectedNodeId: lv.selectedNodeId,
      nodeVisible: lv.nodeVisible ?? v.nodeVisible,
      section: lv.section !== undefined ? lv.section : v.section,
      isolateNodeId:
        lv.isolateNodeId !== undefined ? lv.isolateNodeId : v.isolateNodeId,
    }));
  }, []);

  const inspected = useMemo(
    () =>
      inspectNode(
        { ...baseScene, nodes: displayNodes },
        view.selectedNodeId,
        plan.parts
      ),
    [baseScene, displayNodes, view.selectedNodeId, plan.parts]
  );

  const focusId = view.isolateNodeId || view.selectedNodeId;
  const incidentWires = useMemo(() => {
    if (!focusId) return [];
    return wiresForPart(harnesses, focusId);
  }, [harnesses, focusId]);

  const pinStubs = useMemo(() => {
    if (!focusId) return [];
    return meshPinStubsForNode(focusId);
  }, [focusId]);

  const tree = useMemo(
    () =>
      buildAssemblyTree(
        { ...baseScene, nodes: displayNodes },
        recipe?.productLabel || "Product"
      ),
    [baseScene, displayNodes, recipe]
  );

  const stageH = expanded
    ? Math.min(1000, Math.round(viewportH * 0.86))
    : Math.max(height, 260);

  const phase = frame?.phase;
  const isolating = !!view.isolateNodeId;

  const shell = (
    <div
      className={`rounded-2xl border border-white/10 bg-[#070a0f] overflow-hidden shadow-2xl shadow-black/50 ${className}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-black/30">
        <p className="text-[11px] font-medium text-white/70 truncate max-w-[28%] shrink-0">
          {isolating
            ? `Inspect · ${inspected.node?.label || view.isolateNodeId}`
            : phase?.title || "Product"}
        </p>
        {recipe && !stepChrome && (
          <input
            type="range"
            min={0}
            max={maxPhase * 100}
            value={Math.round(scrub * 100)}
            onChange={(e) => {
              setPlaying(false);
              setScrub(Number(e.target.value) / 100);
            }}
            className="flex-1 accent-cyan-400 h-1.5 cursor-pointer min-w-0"
            aria-label="Assembly phase scrub"
            data-testid="phase-scrub"
            title={frame?.callout || "Build phase"}
          />
        )}
        {stepChrome && <span className="flex-1 min-w-0" />}
        {!stepChrome && (
          <button
            type="button"
            onClick={() => {
              setPlaying((p) => !p);
              if (!playing && scrub >= maxPhase - 0.01) setScrub(0);
            }}
            className={`text-[10px] px-2.5 py-1 rounded-md cursor-pointer font-semibold shrink-0 ${
              playing ? "bg-amber-400 text-black" : "bg-cyan-500 text-black"
            }`}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
        {!stepChrome && (
          <button
            type="button"
            onClick={() => setView((v) => setExplode(v, v.explode > 0.05 ? 0 : 0.5))}
            className={`text-[10px] px-2 py-1 rounded-md cursor-pointer shrink-0 ${
              view.explode > 0.05 ? "bg-white/20 text-white" : "bg-white/10 text-white/60"
            }`}
            title="Explode assembly"
          >
            Explode
          </button>
        )}
        {!stepChrome && (
          <button
            type="button"
            onClick={() => setTreeOpen((t) => !t)}
            className="text-[10px] px-2 py-1 rounded-md bg-white/10 text-white/60 cursor-pointer shrink-0"
            title="Parts tree"
          >
            Tree
          </button>
        )}
        {isolating && (
          <button
            type="button"
            onClick={() => setView((v) => clearIsolate(v))}
            className="text-[10px] px-2 py-1 rounded-md bg-cyan-500/40 text-white cursor-pointer shrink-0 font-medium"
            data-testid="reassemble-btn"
          >
            Reassemble
          </button>
        )}
        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] px-2 py-1 rounded-md bg-white/10 text-white/70 cursor-pointer shrink-0"
          >
            {expanded ? "Close" : "Full"}
          </button>
        )}
      </div>

      <div className="relative w-full bg-[#05080c]" style={{ height: stageH }}>
        <ProductViewer3D
          plan={plan}
          height={stageH}
          showLayerPanel={false}
          compact={false}
          editable={!stepChrome}
          hideChrome
          controlledView={layerView}
          onViewChange={onViewChange}
          harnesses={harnesses}
          sceneNodesOverride={displayNodes}
          onIsolatePart={(id) => setView((v) => toggleIsolate(v, id))}
          phaseCamera={stepChrome ? (focusCamera ?? frame?.cameraHint ?? null) : null}
          idleSpin={stepChrome ? false : undefined}
          transientEpoch={expandEpoch}
          onBeautyMeshChange={(mesh: BeautyMeshSpec) => {
            onPlanPatch?.({ beautyMesh: mesh });
          }}
        />

        {/* Step callout — on-canvas, touch-visible (was a slider tooltip) */}
        {stepChrome && frame?.callout && !inspected.node && (
          <div className="absolute left-3 right-3 bottom-3 z-10 flex items-center gap-2 rounded-lg bg-black/70 backdrop-blur-sm border border-cyan-300/25 px-3 py-2">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#67e8f9] shrink-0" />
            <p className="text-[11px] text-cyan-50/90 leading-snug truncate">{frame.callout}</p>
          </div>
        )}

        {/* Collapsible parts tree */}
        {treeOpen && !stepChrome && (
          <div className="absolute top-3 left-3 z-10 w-[9.5rem] max-h-[50%] overflow-y-auto rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 py-1.5 px-1">
            <p className="text-[9px] uppercase tracking-wide text-white/40 px-1.5 mb-1">
              Parts
            </p>
            <TreeRows
              node={tree}
              depth={0}
              activeId={view.isolateNodeId || view.selectedNodeId}
              onPick={(id) => setView((v) => isolateNode(v, id))}
            />
          </div>
        )}

        {/* Wire legend only when not isolating */}
        {harnesses.length > 0 && !isolating && (
          <div className="absolute top-3 right-3 z-10 rounded-lg bg-black/55 backdrop-blur-sm border border-white/10 px-2 py-1.5 max-w-[10rem]">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-white/45 mb-1">
              Wiring · {harnesses.length}
            </p>
            <ul className="space-y-0.5">
              {wireLegend().map((row) => (
                <li
                  key={`${row.netClass}-${row.meaning}`}
                  className="flex items-center gap-1.5 text-[10px] text-white/70"
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0 ring-1 ring-white/20"
                    style={{ background: row.color }}
                  />
                  <span className="truncate">{row.meaning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Selection / inspect card */}
        {inspected.node && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-md w-[min(92%,22rem)] rounded-lg bg-black/80 backdrop-blur-md border border-white/12 px-3 py-2 z-10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white truncate">
                {inspected.node.label}
                {isolating && (
                  <span className="ml-1.5 text-[10px] text-cyan-300/90 font-normal">
                    isolated
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1 shrink-0">
                {!isolating ? (
                  <button
                    type="button"
                    onClick={() =>
                      setView((v) =>
                        isolateNode(v, inspected.node!.id)
                      )
                    }
                    className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/35 text-cyan-50 cursor-pointer"
                    data-testid="inspect-btn"
                  >
                    Inspect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setView((v) => clearIsolate(v))}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/15 text-white cursor-pointer"
                  >
                    Reassemble
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setView((v) => clearIsolate(selectNode(v, null)))
                  }
                  className="text-[10px] text-white/40 hover:text-white cursor-pointer px-1"
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="text-[9px] text-white/35 mt-0.5">
              Double-click part to isolate · Esc reassemble
            </p>
            {pinStubs.length > 0 && (
              <p className="text-[10px] text-white/50 mt-1 truncate">
                Pins: {pinStubs.map((p) => p.name).join(" · ")}
              </p>
            )}
            {incidentWires.length > 0 ? (
              <ul className="mt-1.5 space-y-1 max-h-28 overflow-y-auto">
                {incidentWires.slice(0, 8).map((w) => (
                  <li
                    key={w.id}
                    className="flex items-start gap-1.5 text-[10px] text-white/65"
                  >
                    <span
                      className="mt-0.5 inline-block w-1.5 h-1.5 rounded-full shrink-0 ring-1 ring-white/15"
                      style={{ background: w.color }}
                    />
                    <span className="leading-snug min-w-0">
                      <span className="text-white/95 font-medium">{w.label}</span>
                      <span className="text-white/40"> AWG{w.awg}</span>
                      <br />
                      <span className="text-white/55">
                        {w.fromNodeId === focusId
                          ? `${w.fromAnchor} → ${w.toNodeId} · ${w.toAnchor}`
                          : `${w.toAnchor} ← ${w.fromNodeId} · ${w.fromAnchor}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-white/35 mt-0.5">No incident nets</p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // Esc reassemble
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView((v) => clearIsolate(v));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ONE stable element tree (eng V4): expanding swaps classNames only — the
  // WebGL canvas must never remount (context loss + full shader recompile).
  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm"
          : "contents"
      }
    >
      <div className={expanded ? "w-full max-w-7xl max-h-[98vh] overflow-auto" : "contents"}>
        {shell}
      </div>
    </div>
  );
}

"use client";

/**
 * Build-session state: one pure reducer replacing the 21-useState sprawl.
 *
 *   prep ──startBuild──▶ build ──openPrep──▶ prep
 *   build: stepIndex 0..steps.length-1 (goStep/next/prev, clamped)
 *          completed: Set<stepNumber> (global numbers, mode-independent)
 *          drawer: exactly one of DRAWER_IDS open at a time (or null)
 *
 * The reducer is pure and exported for tests (the characterization walk from
 * Slice 0 replays against it). Persistence (localStorage) happens in the hook
 * wrapper, never inside the reducer.
 */

import { useMemo, useReducer } from "react";
import type { BuildPlan, BuildStep } from "@/lib/types";
import type { CartStrategy } from "@/lib/cart";
import type { BuildMode } from "@/lib/modes";
import type { SymptomId } from "@/lib/unstick";
import { loadCompletedSteps, saveCompletedSteps, loadMeta, listPlans } from "@/lib/storage";

export type DetailLevel = "quick" | "standard" | "deep";

export type DrawerId =
  | "parts"
  | "firmware"
  | "pcb"
  | "pcbBlocked"
  | "case"
  | "publish"
  | "unstick"
  | "flash"
  // A3: the full step list, opened from the footer's "Step N of M ⌄" trigger.
  | "steps"
  // A4: compiler coverage detail — unassigned wires + content issues.
  | "coverage";

export interface BuildState {
  showPrep: boolean;
  stepIndex: number;
  completed: Set<number>;
  detailLevel: DetailLevel;
  buildMode: BuildMode;
  cartStrategy: CartStrategy;
  drawer: DrawerId | null;
  fwSketchId: string | null;
  unstickSymptom: SymptomId | null;
  safetyAck: boolean;
  authorName: string;
  publishMsg: string;
  shareMsg: string;
  tooltip: string | null;
}

export type BuildAction =
  | { type: "START_BUILD" }
  | { type: "OPEN_PREP" }
  | { type: "GO_STEP"; index: number; max: number }
  | { type: "NEXT_STEP"; max: number }
  | { type: "PREV_STEP" }
  | { type: "CLAMP_STEP"; max: number }
  | { type: "TOGGLE_COMPLETE"; stepNumber: number }
  | { type: "SET_DETAIL"; level: DetailLevel }
  | { type: "SET_BUILD_MODE"; mode: BuildMode }
  | { type: "SET_CART_STRATEGY"; strategy: CartStrategy }
  | { type: "OPEN_DRAWER"; drawer: DrawerId; fwSketchId?: string | null }
  | { type: "CLOSE_DRAWER" }
  | { type: "SET_FW_SKETCH"; id: string | null }
  | { type: "SET_UNSTICK_SYMPTOM"; symptom: SymptomId | null }
  | { type: "SET_SAFETY_ACK"; ack: boolean }
  | { type: "SET_AUTHOR_NAME"; name: string }
  | { type: "SET_PUBLISH_MSG"; msg: string }
  | { type: "SET_SHARE_MSG"; msg: string }
  | { type: "SET_TOOLTIP"; text: string | null };

const clamp = (i: number, max: number) => Math.min(Math.max(0, i), Math.max(0, max - 1));

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  switch (action.type) {
    case "START_BUILD":
      return { ...state, showPrep: false };
    case "OPEN_PREP":
      return { ...state, showPrep: true, drawer: null };
    case "GO_STEP":
      return { ...state, stepIndex: clamp(action.index, action.max) };
    case "NEXT_STEP":
      return { ...state, stepIndex: clamp(state.stepIndex + 1, action.max) };
    case "PREV_STEP":
      return { ...state, stepIndex: Math.max(0, state.stepIndex - 1) };
    case "CLAMP_STEP":
      return state.stepIndex >= action.max
        ? { ...state, stepIndex: clamp(state.stepIndex, action.max) }
        : state;
    case "TOGGLE_COMPLETE": {
      const completed = new Set(state.completed);
      if (completed.has(action.stepNumber)) completed.delete(action.stepNumber);
      else completed.add(action.stepNumber);
      return { ...state, completed };
    }
    case "SET_DETAIL":
      return { ...state, detailLevel: action.level };
    case "SET_BUILD_MODE":
      return { ...state, buildMode: action.mode };
    case "SET_CART_STRATEGY":
      return { ...state, cartStrategy: action.strategy };
    case "OPEN_DRAWER":
      return {
        ...state,
        drawer: action.drawer,
        fwSketchId: action.drawer === "firmware" ? (action.fwSketchId ?? null) : state.fwSketchId,
        unstickSymptom: action.drawer === "unstick" ? null : state.unstickSymptom,
      };
    case "CLOSE_DRAWER":
      return { ...state, drawer: null, unstickSymptom: null, publishMsg: "" };
    case "SET_FW_SKETCH":
      return { ...state, fwSketchId: action.id };
    case "SET_UNSTICK_SYMPTOM":
      return { ...state, unstickSymptom: action.symptom };
    case "SET_SAFETY_ACK":
      return { ...state, safetyAck: action.ack };
    case "SET_AUTHOR_NAME":
      return { ...state, authorName: action.name };
    case "SET_PUBLISH_MSG":
      return { ...state, publishMsg: action.msg };
    case "SET_SHARE_MSG":
      return { ...state, shareMsg: action.msg };
    case "SET_TOOLTIP":
      return { ...state, tooltip: action.text };
    default:
      return state;
  }
}

export interface InitialBuildStateOptions {
  planId: string;
  startAtPrep: boolean;
  /** Injected for tests; defaults read from storage/localStorage. */
  completed?: Set<number>;
  detailLevel?: DetailLevel;
  buildMode?: BuildMode;
  cartStrategy?: CartStrategy;
}

export function initialBuildState(opts: InitialBuildStateOptions): BuildState {
  return {
    showPrep: opts.startAtPrep,
    stepIndex: 0,
    completed: opts.completed ?? new Set<number>(),
    detailLevel: opts.detailLevel ?? "standard",
    buildMode: opts.buildMode ?? "full",
    cartStrategy: opts.cartStrategy ?? "split",
    drawer: null,
    fwSketchId: null,
    unstickSymptom: null,
    safetyAck: false,
    authorName: "Maker",
    publishMsg: "",
    shareMsg: "",
    tooltip: null,
  };
}

/**
 * Progress percent — R2 regression fix. Only steps visible in the CURRENT
 * mode count; completed step numbers from other modes no longer inflate the
 * bar past 100% (old bug: completed.size / steps.length).
 */
export function progressPct(completed: Set<number>, steps: BuildStep[]): number {
  if (steps.length === 0) return 0;
  const done = steps.filter((s) => completed.has(s.stepNumber)).length;
  return Math.round((done / steps.length) * 100);
}

/** Safety acknowledgement gate for the prep screen (behavior unchanged). */
export function needsSafetyAck(plan: BuildPlan, safetyAck: boolean): boolean {
  const hasCritical =
    !!plan.safetyReport?.requiresAttention || (!!plan.electrical && !plan.electrical.erc.clean);
  return hasCritical && !safetyAck;
}

function defaultDetailLevel(planId: string): DetailLevel {
  const meta = loadMeta(planId)?.detailLevel as DetailLevel | undefined;
  if (meta) return meta;
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("forge-detail") as DetailLevel | null;
    if (stored === "quick" || stored === "standard" || stored === "deep") return stored;
  }
  return "standard";
}

/**
 * A5: true when this browser has never saved a single plan — the very first
 * Forge session. Reuses storage.ts's own plan list (the same source every
 * other "has this person built before" question in the app would use), so
 * "saved" means the same thing here that it means everywhere else.
 */
export function isFirstTimeBuilder(): boolean {
  return listPlans().length === 0;
}

/**
 * buildMode default precedence, in order:
 *   1. a buildMode already stored in THIS plan's meta always wins — a
 *      returning builder's own choice is never overridden.
 *   2. first-time builders (see isFirstTimeBuilder) default to "quick" — a
 *      faster first win beats the full path nobody asked for yet.
 *   3. everyone else keeps the prior default, "full".
 * initialBuildState's own `opts.buildMode ?? "full"` fallback is untouched —
 * that's the explicit-injection path tests use directly, and it must stay a
 * pure, storage-free default so those tests stay deterministic.
 */
export function defaultBuildMode(planId: string): BuildMode {
  const stored = loadMeta(planId)?.buildMode as BuildMode | undefined;
  if (stored) return stored;
  return isFirstTimeBuilder() ? "quick" : "full";
}

export function useBuildState(planId: string, startAtPrep: boolean) {
  const [state, dispatch] = useReducer(
    buildReducer,
    undefined,
    (): BuildState =>
      initialBuildState({
        planId,
        startAtPrep,
        completed: loadCompletedSteps(planId),
        detailLevel: defaultDetailLevel(planId),
        buildMode: defaultBuildMode(planId),
        cartStrategy: (loadMeta(planId)?.cartStrategy as CartStrategy | undefined) ?? "split",
      })
  );

  const actions = useMemo(
    () => ({
      startBuild: () => dispatch({ type: "START_BUILD" }),
      openPrep: () => dispatch({ type: "OPEN_PREP" }),
      goStep: (index: number, max: number) => dispatch({ type: "GO_STEP", index, max }),
      nextStep: (max: number) => dispatch({ type: "NEXT_STEP", max }),
      prevStep: () => dispatch({ type: "PREV_STEP" }),
      clampStep: (max: number) => dispatch({ type: "CLAMP_STEP", max }),
      toggleComplete: (stepNumber: number, current: Set<number>) => {
        dispatch({ type: "TOGGLE_COMPLETE", stepNumber });
        // Persist the post-toggle set (reducer is pure; mirror its logic).
        const next = new Set(current);
        if (next.has(stepNumber)) next.delete(stepNumber);
        else next.add(stepNumber);
        saveCompletedSteps(planId, next);
      },
      setDetailLevel: (level: DetailLevel) => {
        dispatch({ type: "SET_DETAIL", level });
        if (typeof window !== "undefined") localStorage.setItem("forge-detail", level);
      },
      setBuildMode: (mode: BuildMode) => dispatch({ type: "SET_BUILD_MODE", mode }),
      setCartStrategy: (strategy: CartStrategy) =>
        dispatch({ type: "SET_CART_STRATEGY", strategy }),
      openDrawer: (drawer: DrawerId, fwSketchId?: string | null) =>
        dispatch({ type: "OPEN_DRAWER", drawer, fwSketchId }),
      closeDrawer: () => dispatch({ type: "CLOSE_DRAWER" }),
      setFwSketch: (id: string | null) => dispatch({ type: "SET_FW_SKETCH", id }),
      setUnstickSymptom: (symptom: SymptomId | null) =>
        dispatch({ type: "SET_UNSTICK_SYMPTOM", symptom }),
      setSafetyAck: (ack: boolean) => dispatch({ type: "SET_SAFETY_ACK", ack }),
      setAuthorName: (name: string) => dispatch({ type: "SET_AUTHOR_NAME", name }),
      setPublishMsg: (msg: string) => dispatch({ type: "SET_PUBLISH_MSG", msg }),
      setShareMsg: (msg: string) => dispatch({ type: "SET_SHARE_MSG", msg }),
      setTooltip: (text: string | null) => dispatch({ type: "SET_TOOLTIP", text }),
    }),
    [planId]
  );

  return { state, actions } as const;
}

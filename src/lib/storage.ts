import type { BuildPlan } from "./types";
import type { CartStrategy } from "./cart";
import { stripDerived } from "./steps/compile";

const PLANS_KEY = "forge-plans";
const STEPS_PREFIX = "forge-steps-";
const META_PREFIX = "forge-meta-";
const ACTIONS_PREFIX = "forge-actions-";

export interface PlanMeta {
  lastOpenedAt: string;
  completedSteps: number[];
  cartStrategy?: CartStrategy;
  buildMode?: "quick" | "full";
  detailLevel?: "quick" | "standard" | "deep";
}

function browser(): boolean {
  return typeof window !== "undefined";
}

export function loadAllPlans(): Record<string, BuildPlan> {
  if (!browser()) return {};
  try {
    return JSON.parse(localStorage.getItem(PLANS_KEY) || "{}");
  } catch {
    return {};
  }
}

export function savePlan(plan: BuildPlan): void {
  if (!browser()) return;
  try {
    const plans = loadAllPlans();
    // Derived facts (step.compiled / compiledFacts) recompute on load —
    // persisting them would only bloat storage and risk staleness (eng 1A).
    plans[plan.id] = stripDerived(plan);
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
  } catch {
    /* quota */
  }
}

export function getPlan(id: string): BuildPlan | null {
  return loadAllPlans()[id] || null;
}

export function deletePlan(id: string): void {
  if (!browser()) return;
  try {
    const plans = loadAllPlans();
    delete plans[id];
    localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    localStorage.removeItem(STEPS_PREFIX + id);
    localStorage.removeItem(META_PREFIX + id);
  } catch {
    /* */
  }
}

export function listPlans(): BuildPlan[] {
  return Object.values(loadAllPlans()).sort((a, b) => {
    const am = loadMeta(a.id)?.lastOpenedAt || a.generatedAt || "";
    const bm = loadMeta(b.id)?.lastOpenedAt || b.generatedAt || "";
    return bm.localeCompare(am);
  });
}

export function loadCompletedSteps(id: string): Set<number> {
  if (!browser()) return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(STEPS_PREFIX + id) || "[]"));
  } catch {
    return new Set();
  }
}

export function saveCompletedSteps(id: string, steps: Set<number>): void {
  if (!browser()) return;
  try {
    localStorage.setItem(STEPS_PREFIX + id, JSON.stringify([...steps]));
    const meta = loadMeta(id) || { lastOpenedAt: new Date().toISOString(), completedSteps: [] };
    meta.completedSteps = [...steps];
    meta.lastOpenedAt = new Date().toISOString();
    saveMeta(id, meta);
  } catch {
    /* */
  }
}

/** Per-action checkbox state for one step (F4 semantics live in the UI). */
export function loadActionChecks(planId: string, stepNumber: number): Set<number> {
  if (!browser()) return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem(`${ACTIONS_PREFIX}${planId}-${stepNumber}`) || "[]")
    );
  } catch {
    return new Set();
  }
}

export function saveActionChecks(planId: string, stepNumber: number, checked: Set<number>): void {
  if (!browser()) return;
  try {
    localStorage.setItem(
      `${ACTIONS_PREFIX}${planId}-${stepNumber}`,
      JSON.stringify([...checked])
    );
  } catch {
    /* quota — progress warning surfaces via diag elsewhere */
  }
}

export function loadMeta(id: string): PlanMeta | null {
  if (!browser()) return null;
  try {
    const raw = localStorage.getItem(META_PREFIX + id);
    return raw ? (JSON.parse(raw) as PlanMeta) : null;
  } catch {
    return null;
  }
}

export function saveMeta(id: string, meta: PlanMeta): void {
  if (!browser()) return;
  try {
    localStorage.setItem(META_PREFIX + id, JSON.stringify(meta));
  } catch {
    /* */
  }
}

export function touchPlan(id: string, patch?: Partial<PlanMeta>): void {
  const prev = loadMeta(id) || {
    lastOpenedAt: new Date().toISOString(),
    completedSteps: [...loadCompletedSteps(id)],
  };
  saveMeta(id, {
    ...prev,
    ...patch,
    lastOpenedAt: new Date().toISOString(),
  });
}

export function newPlanId(prefix = "build"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

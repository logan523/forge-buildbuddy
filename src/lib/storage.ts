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

/** Quota failures were silently swallowed (a builder's progress could stop
    saving with zero signal). Writes stay throw-free; interested UI subscribes
    here to warn the user instead. */
type StorageWarningCb = (context: string) => void;
let storageWarningCb: StorageWarningCb | null = null;
export function onStorageWarning(cb: StorageWarningCb | null): void {
  storageWarningCb = cb;
}
function warnStorage(context: string): void {
  try {
    storageWarningCb?.(context);
  } catch {
    /* a warning must never break a write path */
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
    warnStorage("saving your build");
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

// Guided micro-steps key on the stable connection id (not the action index), so
// per-wire progress survives the recompile-on-every-load of derived facts.
const WIRE_CHECKS_PREFIX = "forge-wirechecks-";

export function loadWireChecks(planId: string, stepNumber: number): Set<string> {
  if (!browser()) return new Set();
  try {
    return new Set(
      JSON.parse(localStorage.getItem(`${WIRE_CHECKS_PREFIX}${planId}-${stepNumber}`) || "[]")
    );
  } catch {
    return new Set();
  }
}

export function saveWireChecks(planId: string, stepNumber: number, checked: Set<string>): void {
  if (!browser()) return;
  try {
    localStorage.setItem(
      `${WIRE_CHECKS_PREFIX}${planId}-${stepNumber}`,
      JSON.stringify([...checked])
    );
  } catch {
    /* quota */
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

// A5: one global (not per-plan) flag — has this browser ever seen the inline
// solder-technique primer in the guided wiring flow? Gates the one-time
// auto-expand on a step's first wire; every wire after that stays reachable
// via a small re-openable chip regardless of this flag.
const TECHNIQUE_PRIMER_SEEN_KEY = "forge-technique-primer-seen";

export function hasSeenTechniquePrimer(): boolean {
  if (!browser()) return false;
  try {
    return localStorage.getItem(TECHNIQUE_PRIMER_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTechniquePrimerSeen(): void {
  if (!browser()) return;
  try {
    localStorage.setItem(TECHNIQUE_PRIMER_SEEN_KEY, "1");
  } catch {
    /* quota */
  }
}

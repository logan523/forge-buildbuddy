/**
 * Sync-read / async-hydrate cache (eng E1). `applyTrustPipeline` is
 * synchronous with ~14 call sites; IndexedDB is async-only — this cache is
 * the bridge. THE TYPE DISTINCTION IS LOAD-BEARING:
 *
 *   readReality(planId) === undefined  → NOT YET HYDRATED (unknown)
 *   readReality(planId) === {joints:{}, …} → hydrated, nothing declared
 *
 * A fail-closed gate must treat `undefined` as UNKNOWN (blocked), never as
 * "clean" — collapsing these two states is the exact inversion eng E1 exists
 * to prevent.
 */

import type { CompiledConnection } from "@/lib/types";
import type { BuildReality } from "./types";
import { loadRealityFromDisk, saveRealityToDisk } from "./store";
import { migrateWirechecks } from "./migrate";
import { emptyReality } from "./reality";

const cache = new Map<string, BuildReality>();
const listeners = new Set<() => void>();
const hydrating = new Map<string, Promise<BuildReality>>();

function notify() {
  for (const l of [...listeners]) l();
}

export function subscribeReality(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Sync read. `undefined` = not hydrated yet (see module doc — this is not "empty"). */
export function readReality(planId: string): BuildReality | undefined {
  return cache.get(planId);
}

/**
 * Hydrate once per plan: disk → (if absent) legacy-wirechecks migration →
 * (if absent) empty. Concurrent calls share one promise.
 */
export function hydrateReality(planId: string, edges: CompiledConnection[] = []): Promise<BuildReality> {
  const cached = cache.get(planId);
  if (cached) return Promise.resolve(cached);
  const inFlight = hydrating.get(planId);
  if (inFlight) return inFlight;

  const p = (async () => {
    const fromDisk = await loadRealityFromDisk(planId);
    let reality = fromDisk;
    if (!reality) {
      const migrated = migrateWirechecks(planId, edges);
      reality = migrated.revision > 0 ? migrated : emptyReality(planId);
      if (migrated.revision > 0) void saveRealityToDisk(reality);
    }
    cache.set(planId, reality);
    hydrating.delete(planId);
    notify();
    return reality;
  })();
  hydrating.set(planId, p);
  return p;
}

/** Write-through: cache now (sync, so the UI re-renders on this revision), disk async. */
export function commitReality(reality: BuildReality): void {
  cache.set(reality.planId, reality);
  notify();
  void saveRealityToDisk(reality);
}

/** Test hook — never used by product code. */
export function __resetRealityCache(): void {
  cache.clear();
  hydrating.clear();
}

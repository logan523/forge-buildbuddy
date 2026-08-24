/**
 * Persistence for BuildReality. IndexedDB primary (photos will need it in a
 * later slice), localStorage fallback when IDB is unavailable — detected by
 * ATTEMPTING an open, never by UA sniffing (Safari private throws on open;
 * Firefox private allows IDB — eng E9). `navigator.storage.persist()` is
 * requested at first write: a 12-day bench build must survive Safari's
 * eviction pressure, and if persistence is denied the caller can nudge an
 * export (eng 2c).
 */

import type { BuildReality } from "./types";
import { REALITY_SCHEMA_VERSION } from "./types";

const DB_NAME = "forge-reality";
const DB_VERSION = 1;
const STORE = "reality";
const LS_PREFIX = "forge-reality-v1:";

let persistRequested = false;

async function requestPersistence(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Advisory only — denial is handled by the export nudge, not here.
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "planId" });
      };
      // Two tabs on different code versions: never hang silently (eng 2c).
      req.onblocked = () => resolve(null);
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function validShape(v: unknown): v is BuildReality {
  const r = v as BuildReality | null;
  return (
    !!r &&
    typeof r === "object" &&
    typeof r.planId === "string" &&
    typeof r.revision === "number" &&
    r.schemaVersion === REALITY_SCHEMA_VERSION &&
    !!r.wireColors &&
    !!r.joints
  );
}

export async function loadRealityFromDisk(planId: string): Promise<BuildReality | null> {
  const db = await openDb();
  if (db) {
    try {
      const out = await new Promise<BuildReality | null>((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(planId);
        req.onsuccess = () => resolve(validShape(req.result) ? req.result : null);
        req.onerror = () => resolve(null);
      });
      db.close();
      if (out) return out;
    } catch {
      db.close();
    }
  }
  // Fallback (private browsing / IDB blocked): localStorage, no photos.
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_PREFIX + planId) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveRealityToDisk(reality: BuildReality): Promise<void> {
  void requestPersistence();
  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(reality);
        tx.oncomplete = () => resolve();
        tx.onabort = () => resolve();
        tx.onerror = () => resolve();
      });
      db.close();
    } catch {
      db.close();
    }
  }
  // Dual-write the fallback so a later IDB-unavailable session still reads
  // the newest state (photo-free at schemaVersion 1, so size is fine).
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LS_PREFIX + reality.planId, JSON.stringify(reality));
    }
  } catch {
    // Quota — reality is small; if this ever trips the caller's storage
    // warning banner (B6) is the surface, not a throw from here.
  }
}

import type { BuildPlan } from "./types";
import { stripDerived } from "./steps/compile";

/**
 * Shareable plan payload (no server).
 * Encode: JSON → UTF-8 → base64url
 * URL: /build/import#<payload>  (hash keeps large payloads off server logs)
 */

export function encodePlanShare(plan: BuildPlan): string {
  // Derived facts recompile on import (trust pipeline runs on every load) —
  // never ship them in a URL that is already ~61KB (eng 1A).
  // customFirmware is dropped entirely: hand-authored firmware source can
  // carry secrets (Wi-Fi credentials are the proven case) and is device-local
  // by nature — a share URL must never be able to leak it. The receiver's
  // plan falls back to generated firmware templates, which is honest.
  const { customFirmware: _cf, ...shareable } = stripDerived(plan);
  void _cf;
  const json = JSON.stringify(shareable);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePlanShare(payload: string): BuildPlan | null {
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const full = b64 + pad;
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(full, "base64").toString("utf8");
    } else {
      const binary = atob(full);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = new TextDecoder().decode(bytes);
    }
    const plan = JSON.parse(json) as BuildPlan;
    if (!plan || !plan.title || !Array.isArray(plan.parts) || !Array.isArray(plan.steps)) return null;
    return plan;
  } catch {
    return null;
  }
}

export function shareUrlForPlan(plan: BuildPlan, origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/build/import#${encodePlanShare(plan)}`;
}

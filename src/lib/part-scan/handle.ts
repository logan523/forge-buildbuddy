/**
 * Part-scan API core — pure handler with injected vision completer
 * (same shape as photo-check for tests without SDK).
 */

import { checkApiGuards } from "@/lib/api-guards";
import {
  buildPartScanUser,
  parseScanMatch,
  PART_SCAN_SYSTEM,
} from "./match";
import type { ScanCandidate, ScanImage, ScanMatchResult } from "./types";

export const PART_SCAN_FAIL_CLOSED =
  "Part scan isn't available right now — pick the part from your BOM list and attach a photo manually.";

interface Body {
  imageBase64?: string;
  mediaType?: string;
  candidates?: ScanCandidate[];
  /** Batch mode: prefer this partId when photo is ambiguous */
  focusPartId?: string;
  focusHint?: string;
}

export async function handlePartScan(
  raw: unknown,
  ip: string,
  completeVision: (
    system: string,
    user: string,
    images: ScanImage[]
  ) => Promise<string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const guard = checkApiGuards("part-scan", ip, JSON.stringify(raw ?? {}).length);
  if (!guard.ok) {
    return {
      status: guard.status,
      body: { error: guard.message, fallback: "manual", match: null },
    };
  }

  const body = (raw && typeof raw === "object" ? raw : {}) as Body;
  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!imageBase64 || imageBase64.length < 32) {
    return {
      status: 400,
      body: { error: "Missing image.", fallback: "manual", match: null },
    };
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates : [];
  if (!candidates.length) {
    return {
      status: 400,
      body: { error: "No part candidates for this plan.", fallback: "manual", match: null },
    };
  }

  const mediaType =
    body.mediaType === "image/png" || body.mediaType === "image/webp"
      ? body.mediaType
      : "image/jpeg";

  const focusPartId =
    typeof body.focusPartId === "string" && body.focusPartId.trim()
      ? body.focusPartId.trim()
      : undefined;
  const focusHint =
    typeof body.focusHint === "string" ? body.focusHint.trim().slice(0, 80) : undefined;

  const user = buildPartScanUser(candidates, { focusPartId, focusHint });
  let text = "";
  try {
    text = await completeVision(PART_SCAN_SYSTEM, user, [
      { data: imageBase64, mediaType },
    ]);
  } catch {
    return {
      status: 502,
      body: { error: PART_SCAN_FAIL_CLOSED, fallback: "manual", match: null },
    };
  }

  const match: ScanMatchResult = parseScanMatch(text, candidates);
  return {
    status: 200,
    body: {
      match,
      candidates: candidates.map((c) => c.partId),
      focusPartId: focusPartId ?? null,
    },
  };
}

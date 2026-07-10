/**
 * "Did I do it right?" photo check (E3) — the hardened-gate version (Tension C).
 *
 * Contract: the verdict is constrained to exactly three shapes and biased
 * toward abstaining. A wrong "looks right" is the worst possible answer, so:
 *   - "cant_tell" is the default whenever anything is unclear, and its detail
 *     must name what to check manually;
 *   - unparseable model output degrades to "cant_tell", never to confidence;
 *   - the feature only renders at all when scripts/eval-photo-check.mjs has
 *     written public/photo-check.pass.json (kill criteria = delete the file).
 *
 * This module is pure (no Next/SDK imports) so the API route, the eval
 * harness, and the contract tests all share the exact same prompt + parser.
 */

import { checkApiGuards } from "@/lib/api-guards";

export type PhotoVerdictKind = "looks_right" | "cant_tell" | "issue";

export interface PhotoVerdict {
  verdict: PhotoVerdictKind;
  detail: string;
}

export interface PhotoCheckImage {
  data: string; // base64, no data: prefix
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export const PHOTO_CHECK_SYSTEM = `You are Forge's photo checker for beginner electronics builds. You compare a builder's photo against the expected wiring facts (and a reference photo of the correct build when provided).

Respond with ONLY a JSON object: {"verdict": "...", "detail": "..."}

verdict must be exactly one of:
- "looks_right" — ONLY when you can clearly see that every listed connection matches: right pin labels, right wire colors, wires plausibly seated. If even one listed connection is not clearly visible in the photo, do NOT use this.
- "cant_tell" — the DEFAULT whenever anything is unclear (blur, angle, occlusion, lighting, part of the board cropped out). detail must name exactly what to check manually, e.g. "can't see where the blue wire lands — check that it's on the pin labeled SDA".
- "issue" — ONLY when you clearly see something wrong. detail must say where, e.g. "the yellow wire appears to land on the pin labeled SDA, not SCL".

Rules:
- Bias hard toward "cant_tell". A wrong "looks_right" sends a beginner onward with a miswired board — it is the worst possible answer.
- Judge ONLY the listed connections and checks. Ignore everything else in the photo.
- detail is one plain-English sentence a complete beginner can follow, quoting pin labels and wire colors verbatim from the facts. Never invent a pin, color, or physical pin position.
- Output the JSON object only. No markdown, no surrounding prose.`;

export const PHOTO_CHECK_ABSTAIN: PhotoVerdict = {
  verdict: "cant_tell",
  detail: "Couldn't analyze the photo confidently — use the manual checklist above.",
};

export const PHOTO_CHECK_FAIL_CLOSED =
  "The photo checker isn't available right now — the manual checklist above covers everything it would look for.";

interface PhotoCheckBody {
  imageBase64: string;
  referenceBase64?: string;
  mediaType?: string;
  stepTitle?: string;
  connections?: {
    colorName?: string;
    fromLabel?: string;
    fromPin?: string;
    toLabel?: string;
    toPin?: string;
  }[];
  checks?: { instruction?: string; expected?: string }[];
}

export function buildPhotoCheckUser(body: {
  stepTitle?: string;
  connections?: PhotoCheckBody["connections"];
  checks?: PhotoCheckBody["checks"];
  hasReference: boolean;
}): string {
  const connections = (Array.isArray(body.connections) ? body.connections : [])
    .slice(0, 40)
    .map(
      (c) =>
        `${String(c?.colorName ?? "").slice(0, 12)} wire: ${String(c?.fromLabel ?? "").slice(0, 40)} pin ${String(c?.fromPin ?? "").slice(0, 12)} → ${String(c?.toLabel ?? "").slice(0, 40)} pin ${String(c?.toPin ?? "").slice(0, 12)}`
    );
  const checks = (Array.isArray(body.checks) ? body.checks : [])
    .slice(0, 10)
    .map((c) => `${String(c?.instruction ?? "").slice(0, 120)} → ${String(c?.expected ?? "").slice(0, 40)}`);

  return [
    body.hasReference
      ? "Image 1 is the REFERENCE photo of the correct build. Image 2 is the BUILDER'S photo to check."
      : "Image 1 is the BUILDER'S photo to check.",
    `STEP: ${String(body.stepTitle ?? "").slice(0, 120)}`,
    connections.length
      ? `EXPECTED CONNECTIONS (the only truth to judge against):\n${connections.join("\n")}`
      : "EXPECTED CONNECTIONS: none listed — judge only the checks below.",
    checks.length ? `CHECKS:\n${checks.join("\n")}` : "",
    `Compare the builder's photo against the expected connections and reply with the JSON verdict.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Abstain-biased parser: anything that isn't a clean, in-enum verdict becomes
 * "cant_tell" pointing back at the manual checklist. Handles fenced/prosed JSON.
 */
export function parsePhotoVerdict(text: string): PhotoVerdict {
  const match = String(text ?? "").match(/\{[\s\S]*?\}/);
  if (!match) return PHOTO_CHECK_ABSTAIN;
  try {
    const obj = JSON.parse(match[0]) as { verdict?: unknown; detail?: unknown };
    const verdict = obj.verdict;
    if (verdict !== "looks_right" && verdict !== "cant_tell" && verdict !== "issue") {
      return PHOTO_CHECK_ABSTAIN;
    }
    const detail = typeof obj.detail === "string" && obj.detail.trim()
      ? obj.detail.trim().slice(0, 300)
      : verdict === "looks_right"
        ? "Every listed connection is visible and matches."
        : PHOTO_CHECK_ABSTAIN.detail;
    return { verdict, detail };
  } catch {
    return PHOTO_CHECK_ABSTAIN;
  }
}

export interface PhotoCheckResult {
  status: number;
  body: PhotoVerdict | { error: string; fallback: "manual" };
}

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Core handler — dependency-injected vision fn so contract tests and the eval harness run without the SDK. */
export async function handlePhotoCheck(
  raw: unknown,
  ip: string,
  completeVision: (system: string, user: string, images: PhotoCheckImage[]) => Promise<string>
): Promise<PhotoCheckResult> {
  const body = raw as PhotoCheckBody | null;
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
  if (!imageBase64) {
    return {
      status: 400,
      body: { error: "No photo received — try taking it again.", fallback: "manual" },
    };
  }

  const mediaType = (
    MEDIA_TYPES.has(String(body?.mediaType)) ? body!.mediaType : "image/jpeg"
  ) as PhotoCheckImage["mediaType"];
  const referenceBase64 =
    typeof body?.referenceBase64 === "string" && body.referenceBase64 ? body.referenceBase64 : null;

  const user = buildPhotoCheckUser({
    stepTitle: body?.stepTitle,
    connections: body?.connections,
    checks: body?.checks,
    hasReference: !!referenceBase64,
  });

  const guard = checkApiGuards(
    "photo-check",
    ip,
    imageBase64.length + (referenceBase64?.length ?? 0) + user.length
  );
  if (!guard.ok) {
    return { status: guard.status, body: { error: guard.message, fallback: "manual" } };
  }

  const images: PhotoCheckImage[] = [];
  if (referenceBase64) images.push({ data: referenceBase64, mediaType: "image/jpeg" });
  images.push({ data: imageBase64, mediaType });

  try {
    const text = await completeVision(PHOTO_CHECK_SYSTEM, user, images);
    // Unparseable output is an abstain (a valid answer), not an error.
    return { status: 200, body: parsePhotoVerdict(text) };
  } catch {
    return { status: 502, body: { error: PHOTO_CHECK_FAIL_CLOSED, fallback: "manual" } };
  }
}

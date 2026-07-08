/**
 * External beauty mesh generation (Meshy primary; Tripo hook).
 * Never product authority — returns BeautyMeshSpec for underlay only.
 */
import type { BuildPlan } from "@/lib/types";
import {
  buildBeautyPrompt,
  beautyGenerationConfigured,
  type BeautyMeshSpec,
  type BeautyProvider,
} from "./beauty-mesh";

const MESHY_BASE = "https://api.meshy.ai/openapi/v2";

export interface BeautyTaskStatus {
  taskId: string;
  provider: BeautyProvider;
  status: "pending" | "in_progress" | "ready" | "failed";
  progress: number;
  beautyMesh?: BeautyMeshSpec;
  error?: string;
  prompt: string;
}

function meshyKey(env = process.env): string | undefined {
  return env.MESHY_API_KEY || undefined;
}

function tripoKey(env = process.env): string | undefined {
  return env.TRIPO_API_KEY || undefined;
}

/** Start a preview text-to-3D job. Preview GLB is enough for underlay. */
export async function startBeautyGeneration(
  plan: BuildPlan,
  opts?: { prompt?: string; env?: NodeJS.ProcessEnv }
): Promise<BeautyTaskStatus> {
  const env = opts?.env || process.env;
  const prompt = (opts?.prompt || buildBeautyPrompt(plan)).slice(0, 600);
  const { configured, provider } = beautyGenerationConfigured(env);

  if (!configured || !provider) {
    return {
      taskId: "",
      provider: "unknown",
      status: "failed",
      progress: 0,
      prompt,
      error: "No MESHY_API_KEY or TRIPO_API_KEY configured.",
    };
  }

  if (provider === "meshy") {
    return startMeshyPreview(prompt, meshyKey(env)!);
  }
  if (provider === "tripo") {
    return startTripo(prompt, tripoKey(env)!);
  }

  return {
    taskId: "",
    provider,
    status: "failed",
    progress: 0,
    prompt,
    error: "Unsupported provider",
  };
}

async function startMeshyPreview(prompt: string, apiKey: string): Promise<BeautyTaskStatus> {
  const res = await fetch(`${MESHY_BASE}/text-to-3d`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "preview",
      prompt,
      target_formats: ["glb"],
      ai_model: "latest",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      taskId: "",
      provider: "meshy",
      status: "failed",
      progress: 0,
      prompt,
      error: `Meshy create failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as { result?: string };
  const taskId = data.result || "";
  if (!taskId) {
    return {
      taskId: "",
      provider: "meshy",
      status: "failed",
      progress: 0,
      prompt,
      error: "Meshy returned no task id",
    };
  }

  return {
    taskId,
    provider: "meshy",
    status: "pending",
    progress: 0,
    prompt,
    beautyMesh: {
      url: "https://example.invalid/pending.glb",
      provider: "meshy",
      status: "pending",
      prompt,
      opacity: 0.38,
      scale: 1,
    },
  };
}

/** Poll Meshy/Tripo task; on SUCCEEDED return ready BeautyMeshSpec with GLB url. */
export async function pollBeautyGeneration(
  taskId: string,
  provider: BeautyProvider,
  opts?: { prompt?: string; env?: NodeJS.ProcessEnv }
): Promise<BeautyTaskStatus> {
  const env = opts?.env || process.env;
  const prompt = opts?.prompt || "";

  if (provider === "meshy") {
    return pollMeshy(taskId, prompt, meshyKey(env));
  }
  if (provider === "tripo") {
    return pollTripo(taskId, prompt, tripoKey(env));
  }
  return {
    taskId,
    provider,
    status: "failed",
    progress: 0,
    prompt,
    error: "Unsupported provider",
  };
}

async function pollMeshy(
  taskId: string,
  prompt: string,
  apiKey?: string
): Promise<BeautyTaskStatus> {
  if (!apiKey) {
    return {
      taskId,
      provider: "meshy",
      status: "failed",
      progress: 0,
      prompt,
      error: "MESHY_API_KEY not configured",
    };
  }

  const res = await fetch(`${MESHY_BASE}/text-to-3d/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      taskId,
      provider: "meshy",
      status: "failed",
      progress: 0,
      prompt,
      error: `Meshy poll failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as {
    status?: string;
    progress?: number;
    model_urls?: { glb?: string };
    task_error?: { message?: string };
    prompt?: string;
  };

  const status = (data.status || "").toUpperCase();
  const progress = typeof data.progress === "number" ? data.progress : 0;
  const usedPrompt = data.prompt || prompt;

  if (status === "SUCCEEDED") {
    const glb = data.model_urls?.glb;
    if (!glb) {
      return {
        taskId,
        provider: "meshy",
        status: "failed",
        progress: 100,
        prompt: usedPrompt,
        error: "Meshy succeeded but no GLB URL",
      };
    }
    return {
      taskId,
      provider: "meshy",
      status: "ready",
      progress: 100,
      prompt: usedPrompt,
      beautyMesh: {
        url: glb,
        provider: "meshy",
        status: "ready",
        prompt: usedPrompt,
        opacity: 0.38,
        scale: 1,
      },
    };
  }

  if (status === "FAILED" || status === "CANCELED") {
    return {
      taskId,
      provider: "meshy",
      status: "failed",
      progress,
      prompt: usedPrompt,
      error: data.task_error?.message || `Meshy task ${status}`,
    };
  }

  return {
    taskId,
    provider: "meshy",
    status: status === "IN_PROGRESS" ? "in_progress" : "pending",
    progress,
    prompt: usedPrompt,
    beautyMesh: {
      url: "https://example.invalid/pending.glb",
      provider: "meshy",
      status: "pending",
      prompt: usedPrompt,
      opacity: 0.38,
      scale: 1,
    },
  };
}

/** Tripo OpenAPI (minimal) — https://platform.tripo3d.ai */
async function startTripo(prompt: string, apiKey: string): Promise<BeautyTaskStatus> {
  const res = await fetch("https://api.tripo3d.ai/v2/openapi/task", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "text_to_model",
      prompt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      taskId: "",
      provider: "tripo",
      status: "failed",
      progress: 0,
      prompt,
      error: `Tripo create failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as { data?: { task_id?: string }; task_id?: string };
  const taskId = data.data?.task_id || data.task_id || "";
  if (!taskId) {
    return {
      taskId: "",
      provider: "tripo",
      status: "failed",
      progress: 0,
      prompt,
      error: "Tripo returned no task id",
    };
  }

  return {
    taskId,
    provider: "tripo",
    status: "pending",
    progress: 0,
    prompt,
    beautyMesh: {
      url: "https://example.invalid/pending.glb",
      provider: "tripo",
      status: "pending",
      prompt,
      opacity: 0.38,
      scale: 1,
    },
  };
}

async function pollTripo(
  taskId: string,
  prompt: string,
  apiKey?: string
): Promise<BeautyTaskStatus> {
  if (!apiKey) {
    return {
      taskId,
      provider: "tripo",
      status: "failed",
      progress: 0,
      prompt,
      error: "TRIPO_API_KEY not configured",
    };
  }

  const res = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      taskId,
      provider: "tripo",
      status: "failed",
      progress: 0,
      prompt,
      error: `Tripo poll failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = (await res.json()) as {
    data?: {
      status?: string;
      progress?: number;
      output?: { model?: string; pbr_model?: string };
    };
  };
  const st = (data.data?.status || "").toLowerCase();
  const progress = data.data?.progress ?? 0;
  const glb = data.data?.output?.pbr_model || data.data?.output?.model;

  if (st === "success" || st === "succeeded") {
    if (!glb) {
      return {
        taskId,
        provider: "tripo",
        status: "failed",
        progress: 100,
        prompt,
        error: "Tripo succeeded but no model URL",
      };
    }
    return {
      taskId,
      provider: "tripo",
      status: "ready",
      progress: 100,
      prompt,
      beautyMesh: {
        url: glb,
        provider: "tripo",
        status: "ready",
        prompt,
        opacity: 0.38,
        scale: 1,
      },
    };
  }

  if (st === "failed" || st === "cancelled" || st === "banned") {
    return {
      taskId,
      provider: "tripo",
      status: "failed",
      progress,
      prompt,
      error: `Tripo task ${st}`,
    };
  }

  return {
    taskId,
    provider: "tripo",
    status: st === "running" || st === "processing" ? "in_progress" : "pending",
    progress,
    prompt,
    beautyMesh: {
      url: "https://example.invalid/pending.glb",
      provider: "tripo",
      status: "pending",
      prompt,
      opacity: 0.38,
      scale: 1,
    },
  };
}

/** Pure helpers for tests — map Meshy status strings. */
export function mapMeshyStatus(status: string): BeautyTaskStatus["status"] {
  const s = status.toUpperCase();
  if (s === "SUCCEEDED") return "ready";
  if (s === "FAILED" || s === "CANCELED") return "failed";
  if (s === "IN_PROGRESS") return "in_progress";
  return "pending";
}

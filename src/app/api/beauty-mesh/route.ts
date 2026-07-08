import { NextResponse } from "next/server";
import type { BuildPlan } from "@/lib/types";
import { beautyGenerationConfigured } from "@/lib/product-3d/beauty-mesh";
import { startBeautyGeneration, pollBeautyGeneration } from "@/lib/product-3d/beauty-generate";
import type { BeautyProvider } from "@/lib/product-3d/beauty-mesh";

/**
 * GET — status of generation env + optional task poll
 *   ?taskId=&provider=meshy
 * POST — start beauty generation from plan snapshot
 *   { plan: BuildPlan, prompt?: string }
 *
 * Beauty is never product authority. Requires MESHY_API_KEY or TRIPO_API_KEY.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const provider = (searchParams.get("provider") || "meshy") as BeautyProvider;
  const prompt = searchParams.get("prompt") || "";

  const cfg = beautyGenerationConfigured();

  if (!taskId) {
    return NextResponse.json({
      configured: cfg.configured,
      provider: cfg.provider,
      disclaimer: "Beauty mesh is visual only — layers and BOM are the real product model.",
    });
  }

  if (!cfg.configured) {
    return NextResponse.json(
      { error: "No mesh provider configured (MESHY_API_KEY or TRIPO_API_KEY)." },
      { status: 503 }
    );
  }

  try {
    const status = await pollBeautyGeneration(taskId, provider, { prompt });
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Poll failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const cfg = beautyGenerationConfigured();
  if (!cfg.configured) {
    return NextResponse.json(
      {
        error: "Beauty generation not configured. Set MESHY_API_KEY or TRIPO_API_KEY.",
        configured: false,
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const plan = body.plan as BuildPlan | undefined;
    if (!plan || typeof plan !== "object" || !plan.title) {
      return NextResponse.json({ error: "Body must include plan with title." }, { status: 400 });
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : undefined;
    const status = await startBeautyGeneration(plan, { prompt });
    if (status.status === "failed" && !status.taskId) {
      return NextResponse.json(status, { status: 502 });
    }
    return NextResponse.json(status);
  } catch (err) {
    console.error("beauty-mesh POST:", err);
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

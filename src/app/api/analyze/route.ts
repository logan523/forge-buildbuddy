import { NextResponse } from "next/server";
import { fetchTranscript, extractVideoId } from "@/lib/transcript";
import { enrichLivePrices, nexarConfigured } from "@/lib/nexar";
import { estimateBom } from "@/lib/cart";
import { runPipeline } from "@/lib/pipeline/run";

export async function POST(request: Request) {
  try {
    const { url, description } = await request.json();
    let text: string;
    let sourceUrl: string | undefined;

    if (url) {
      const videoId = extractVideoId(url);
      if (!videoId) {
        return NextResponse.json({ error: "Invalid YouTube URL." }, { status: 400 });
      }
      sourceUrl = url;
      try {
        text = await fetchTranscript(url);
      } catch {
        return NextResponse.json(
          { error: "Could not fetch transcript. The video may not have captions available." },
          { status: 422 }
        );
      }
    } else if (description) {
      text = description;
    } else {
      return NextResponse.json(
        { error: "Please provide a YouTube URL or project description." },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
    }

    // 6-layer agent stack (falls back to single-pass inside runPipeline)
    let plan = await runPipeline({ text, sourceUrl, apiKey });

    if (nexarConfigured()) {
      try {
        const liveParts = await enrichLivePrices(plan.parts);
        const bom = estimateBom(liveParts, "split");
        plan = {
          ...plan,
          parts: liveParts,
          bomEstimate: {
            totalMin: bom.totalMin,
            totalMax: bom.totalMax,
            currency: bom.currency,
            pricedCount: bom.pricedCount,
            unpricedCount: bom.unpricedCount,
          },
        };
      } catch (err) {
        console.warn("Live pricing skipped:", err);
      }
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Analysis error:", error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

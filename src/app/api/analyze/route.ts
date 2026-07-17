import { NextResponse } from "next/server";
import { checkApiGuards, clientIp } from "@/lib/api-guards";
import { fetchTranscript, extractVideoId } from "@/lib/transcript";
import { classifyYoutubeError, YOUTUBE_ERROR_RESPONSES, YoutubeVideoError } from "@/lib/youtube-errors";
import { enrichLivePrices, nexarConfigured } from "@/lib/nexar";
import { estimateBom } from "@/lib/cart";
import { runPipeline } from "@/lib/pipeline/run";

export async function POST(request: Request) {
  // --- Pre-flight validation returns plain JSON (with real status codes) so the
  // client can surface the error before any streaming begins. ---
  let url: string | undefined;
  let description: string | undefined;
  try {
    ({ url, description } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  let text: string;
  let sourceUrl: string | undefined;

  if (url) {
    const videoId = extractVideoId(url);
    if (!videoId) {
      const badUrl = YOUTUBE_ERROR_RESPONSES["bad-url"];
      return NextResponse.json({ error: badUrl.message, errorType: "bad-url" }, { status: badUrl.status });
    }
    sourceUrl = url;
    try {
      text = await fetchTranscript(url);
    } catch (err) {
      // transcript.ts always throws YoutubeVideoError, but re-classify
      // defensively in case something upstream ever throws a raw error.
      const classified = err instanceof YoutubeVideoError ? err : classifyYoutubeError(err);
      const response = YOUTUBE_ERROR_RESPONSES[classified.type];
      return NextResponse.json(
        { error: response.message, errorType: classified.type },
        { status: response.status }
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

  // Abuse/spend guards (eng F3 + Tension E) — fail closed, friendly message.
  const guard = checkApiGuards("analyze", clientIp(request), text.length);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.message }, { status: guard.status });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured." }, { status: 500 });
  }

  // --- Past validation: stream honest per-layer progress as newline-delimited JSON. ---
  const inputText = text;
  const inputSourceUrl = sourceUrl;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* stream may already be closed if the client disconnected */
        }
      };

      try {
        let plan = await runPipeline({
          text: inputText,
          sourceUrl: inputSourceUrl,
          apiKey,
          onProgress: (p) => send({ type: "progress", ...p }),
        });

        if (nexarConfigured()) {
          send({ type: "progress", layer: 6, name: "pricing", status: "start" });
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

        send({ type: "done", plan });
      } catch (error) {
        console.error("Analysis error:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering so progress lines flush as they happen.
      "X-Accel-Buffering": "no",
    },
  });
}

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { clientIp } from "@/lib/api-guards";
import { handlePhotoCheck, PHOTO_CHECK_FAIL_CLOSED } from "@/lib/photo-check";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", fallback: "manual" },
      { status: 400 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: PHOTO_CHECK_FAIL_CLOSED, fallback: "manual" },
      { status: 503 }
    );
  }
  const client = new Anthropic({ apiKey });

  const result = await handlePhotoCheck(raw, clientIp(request), async (system, user, images) => {
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        temperature: 0,
        system,
        messages: [
          {
            role: "user",
            content: [
              ...images.map(
                (img) =>
                  ({
                    type: "image",
                    source: { type: "base64", media_type: img.mediaType, data: img.data },
                  }) as const
              ),
              { type: "text", text: user },
            ],
          },
        ],
      },
      { timeout: 45_000 }
    );
    const content = response.content[0];
    return content?.type === "text" ? content.text : "";
  });

  return NextResponse.json(result.body, { status: result.status });
}

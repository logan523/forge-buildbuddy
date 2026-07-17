import { YoutubeTranscript } from "youtube-transcript";
import { classifyYoutubeError, YoutubeVideoError } from "./youtube-errors";

export async function fetchTranscript(url: string): Promise<string> {
  let transcript;
  try {
    transcript = await YoutubeTranscript.fetchTranscript(url);
  } catch (err) {
    // Re-classify into our taxonomy so route.ts can give an honest,
    // type-specific status + message instead of one flat 422 (B2 #6).
    throw classifyYoutubeError(err);
  }
  if (!transcript || transcript.length === 0) {
    throw new YoutubeVideoError("no-captions", "No transcript available for this video");
  }
  return transcript.map((entry) => entry.text).join(" ");
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

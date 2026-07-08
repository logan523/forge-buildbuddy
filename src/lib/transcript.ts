import { YoutubeTranscript } from "youtube-transcript";

export async function fetchTranscript(url: string): Promise<string> {
  const transcript = await YoutubeTranscript.fetchTranscript(url);
  if (!transcript || transcript.length === 0) {
    throw new Error("No transcript available for this video");
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

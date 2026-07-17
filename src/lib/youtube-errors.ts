/**
 * Typed YouTube transcript error taxonomy (B2 #6).
 *
 * `transcript.ts` throws these instead of one flat string so
 * `api/analyze/route.ts` can map each to a distinct status + honest message,
 * and the homepage can offer a targeted recovery action (e.g. "Switch to
 * describe it" for no-captions) instead of a generic "something went wrong."
 *
 * Classification is subclass-first — instanceof checks against
 * youtube-transcript's own error classes, which is precise and stays correct
 * across minor version bumps — with message-sniffing as a fallback for two
 * things that subclassing can't give us: (1) raw network failures, which
 * aren't part of that library's class hierarchy at all (a bare fetch()
 * TypeError from undici), and (2) refining *why* a video is unavailable,
 * since the library's own message text doesn't carry that detail today.
 */

import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";

export type YoutubeErrorType = "bad-url" | "no-captions" | "unavailable" | "network";

export type UnavailableReason = "private" | "deleted" | "geo" | "age" | "unknown";

export class YoutubeVideoError extends Error {
  readonly type: YoutubeErrorType;
  readonly reason?: UnavailableReason;

  constructor(type: YoutubeErrorType, message: string, reason?: UnavailableReason) {
    super(message);
    this.name = "YoutubeVideoError";
    this.type = type;
    this.reason = reason;
  }
}

/**
 * Single source of truth for the HTTP response each bucket maps to.
 * route.ts reads this directly — copy lives in exactly one place.
 */
export const YOUTUBE_ERROR_RESPONSES: Record<YoutubeErrorType, { status: number; message: string }> = {
  "bad-url": {
    status: 400,
    message: "Invalid YouTube URL.",
  },
  "no-captions": {
    status: 422,
    message: "This video doesn't have captions — try describing the project instead.",
  },
  unavailable: {
    status: 422,
    message: "Can't access this video — it may be private or removed. Try another link or describe it.",
  },
  network: {
    status: 503,
    message: "Couldn't reach YouTube right now — try again in a moment.",
  },
};

const NETWORK_MESSAGE_HINTS = [
  "fetch failed",
  "enotfound",
  "econnrefused",
  "econnreset",
  "etimedout",
  "eai_again",
  "network",
  "socket hang up",
  "und_err",
];

function looksLikeNetworkFailure(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_MESSAGE_HINTS.some((hint) => lower.includes(hint));
}

/**
 * The youtube-transcript library doesn't say *why* a video is unavailable
 * today (its message is a flat "no longer available"), but message-sniff
 * anyway so this stays correct if a future version — or another caller —
 * adds detail.
 */
function sniffUnavailableReason(message: string): UnavailableReason {
  const lower = message.toLowerCase();
  if (lower.includes("private")) return "private";
  if (lower.includes("remov") || lower.includes("delet")) return "deleted";
  if (lower.includes("region") || lower.includes("countr") || lower.includes("geo")) return "geo";
  if (lower.includes("age")) return "age";
  return "unknown";
}

/**
 * Classify any error thrown while resolving a YouTube transcript into one of
 * four buckets the product can act on differently. Never throws.
 */
export function classifyYoutubeError(err: unknown): YoutubeVideoError {
  if (err instanceof YoutubeVideoError) return err;

  const message = err instanceof Error ? err.message : String(err);

  // YouTube itself is throttling us (captcha wall) — transient, worth
  // retrying later, not a property of this specific video.
  if (err instanceof YoutubeTranscriptTooManyRequestError) {
    return new YoutubeVideoError("network", message);
  }

  // The video loaded fine, but there's no transcript to read.
  if (
    err instanceof YoutubeTranscriptDisabledError ||
    err instanceof YoutubeTranscriptNotAvailableError ||
    err instanceof YoutubeTranscriptNotAvailableLanguageError
  ) {
    return new YoutubeVideoError("no-captions", message);
  }

  // The video itself couldn't be loaded (removed / private / geo-blocked /
  // age-gated) — the library doesn't say which today.
  if (err instanceof YoutubeTranscriptVideoUnavailableError) {
    return new YoutubeVideoError("unavailable", message, sniffUnavailableReason(message));
  }

  // Base class fires directly for "Impossible to retrieve Youtube video ID" —
  // malformed input that slipped past our own extractVideoId gate.
  if (err instanceof YoutubeTranscriptError) {
    return new YoutubeVideoError("bad-url", message);
  }

  // Not one of the library's own errors at all — most likely the raw
  // fetch() to youtube.com failing (offline, DNS, timeout) before the
  // library ever got a response to interpret.
  if (looksLikeNetworkFailure(message)) {
    return new YoutubeVideoError("network", message);
  }

  // Unrecognized shape — fail closed to "unavailable" rather than inviting
  // an instant silent retry against an error we don't understand.
  return new YoutubeVideoError("unavailable", message, "unknown");
}

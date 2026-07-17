import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
} from "youtube-transcript";
import { classifyYoutubeError, YOUTUBE_ERROR_RESPONSES, YoutubeVideoError } from "./youtube-errors";

describe("classifyYoutubeError — subclass detection (real youtube-transcript errors)", () => {
  test("disabled captions -> no-captions", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptDisabledError("abc123"));
    assert.equal(c.type, "no-captions");
  });

  test("no transcripts available -> no-captions", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptNotAvailableError("abc123"));
    assert.equal(c.type, "no-captions");
  });

  test("no transcripts in requested language -> no-captions", () => {
    const c = classifyYoutubeError(
      new YoutubeTranscriptNotAvailableLanguageError("fr", ["en", "es"], "abc123")
    );
    assert.equal(c.type, "no-captions");
  });

  test("video unavailable -> unavailable, reason unknown (library gives no detail today)", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptVideoUnavailableError("abc123"));
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "unknown");
  });

  test("too many requests / captcha wall -> network (transient, not video-specific)", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptTooManyRequestError());
    assert.equal(c.type, "network");
  });

  test("bare base-class error (bad video id parse) -> bad-url", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptError("Impossible to retrieve Youtube video ID."));
    assert.equal(c.type, "bad-url");
  });
});

describe("classifyYoutubeError — message-sniffed reason refinement", () => {
  // The pinned library version doesn't emit these richer messages yet, but the
  // classifier should stay correct if a future version (or another source)
  // does — these are synthetic fixtures for that contract.
  test("sniffs 'private' out of an unavailable message", () => {
    const c = classifyYoutubeError(new YoutubeTranscriptVideoUnavailableError("This video is private (abc)"));
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "private");
  });

  test("sniffs 'removed' as deleted", () => {
    class FakeUnavailable extends YoutubeTranscriptVideoUnavailableError {
      constructor() {
        super("x");
        Object.defineProperty(this, "message", { value: "This video has been removed by the uploader" });
      }
    }
    const c = classifyYoutubeError(new FakeUnavailable());
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "deleted");
  });

  test("sniffs 'region' as geo", () => {
    class FakeUnavailable extends YoutubeTranscriptVideoUnavailableError {
      constructor() {
        super("x");
        Object.defineProperty(this, "message", { value: "Not available in your region" });
      }
    }
    const c = classifyYoutubeError(new FakeUnavailable());
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "geo");
  });

  test("sniffs 'age' as age-gated", () => {
    class FakeUnavailable extends YoutubeTranscriptVideoUnavailableError {
      constructor() {
        super("x");
        Object.defineProperty(this, "message", { value: "This video requires age verification" });
      }
    }
    const c = classifyYoutubeError(new FakeUnavailable());
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "age");
  });
});

describe("classifyYoutubeError — non-library errors (raw network / unknown)", () => {
  test("undici fetch failure -> network", () => {
    const c = classifyYoutubeError(new TypeError("fetch failed"));
    assert.equal(c.type, "network");
  });

  test("DNS failure message -> network", () => {
    const c = classifyYoutubeError(new Error("getaddrinfo ENOTFOUND www.youtube.com"));
    assert.equal(c.type, "network");
  });

  test("connection reset -> network", () => {
    const c = classifyYoutubeError(new Error("read ECONNRESET"));
    assert.equal(c.type, "network");
  });

  test("timeout -> network", () => {
    const c = classifyYoutubeError(new Error("Request timed out (ETIMEDOUT)"));
    assert.equal(c.type, "network");
  });

  test("totally unrecognized error -> fails closed to unavailable/unknown, not a silent-retry type", () => {
    const c = classifyYoutubeError(new Error("something bizarre happened"));
    assert.equal(c.type, "unavailable");
    assert.equal(c.reason, "unknown");
  });

  test("non-Error thrown value is stringified, not thrown from the classifier", () => {
    const c = classifyYoutubeError("plain string throw");
    assert.equal(c.type, "unavailable");
  });

  test("already-classified YoutubeVideoError passes through unchanged (idempotent)", () => {
    const original = new YoutubeVideoError("no-captions", "already classified");
    const c = classifyYoutubeError(original);
    assert.equal(c, original);
  });
});

describe("YOUTUBE_ERROR_RESPONSES — status + copy contract", () => {
  test("no-captions has the exact spec copy and a 422", () => {
    assert.equal(
      YOUTUBE_ERROR_RESPONSES["no-captions"].message,
      "This video doesn't have captions — try describing the project instead."
    );
    assert.equal(YOUTUBE_ERROR_RESPONSES["no-captions"].status, 422);
  });

  test("unavailable has the exact spec copy and a 422", () => {
    assert.equal(
      YOUTUBE_ERROR_RESPONSES.unavailable.message,
      "Can't access this video — it may be private or removed. Try another link or describe it."
    );
    assert.equal(YOUTUBE_ERROR_RESPONSES.unavailable.status, 422);
  });

  test("network is retryable (503) and doesn't blame the video", () => {
    assert.equal(YOUTUBE_ERROR_RESPONSES.network.status, 503);
    assert.match(YOUTUBE_ERROR_RESPONSES.network.message, /try again/i);
  });

  test("bad-url is a 400", () => {
    assert.equal(YOUTUBE_ERROR_RESPONSES["bad-url"].status, 400);
  });

  test("every taxonomy type has a response entry", () => {
    const types = ["bad-url", "no-captions", "unavailable", "network"] as const;
    for (const t of types) {
      assert.ok(YOUTUBE_ERROR_RESPONSES[t].message.length > 0);
    }
  });
});

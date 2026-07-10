/**
 * Abuse + spend guards for the AI routes (eng F3 + Tension E).
 *
 * Two layers, both fail-closed with friendly messages:
 *   1. Best-effort per-IP token bucket — honest for `next start` / self-host;
 *      DOCUMENTED as non-serverless-safe (each lambda gets its own memory).
 *   2. Global daily request cap per route — the spend circuit-breaker.
 *      Module-scope in-memory Map (eng 2A): restart resets the counter, which
 *      is accepted semantics (a ceiling, not billing-grade metering).
 *
 * Enabling these routes on a PUBLIC deploy is an explicit go-decision that
 * requires a shared limiter store (see docs/designs/step-instruction-overhaul.md).
 */

type RouteId = "step-help" | "photo-check" | "analyze";

interface GuardConfig {
  maxInputChars: number;
  perIp: number;
  windowMs: number;
  dailyDefault: number;
  dailyEnv: string;
}

const CONFIGS: Record<RouteId, GuardConfig> = {
  "step-help": {
    maxInputChars: 8_000,
    perIp: 10,
    windowMs: 10 * 60_000,
    dailyDefault: 200,
    dailyEnv: "STEP_HELP_DAILY_CAP",
  },
  "photo-check": {
    maxInputChars: 4_000_000, // base64 image budget
    perIp: 5,
    windowMs: 10 * 60_000,
    dailyDefault: 100,
    dailyEnv: "PHOTO_CHECK_DAILY_CAP",
  },
  analyze: {
    maxInputChars: 120_000,
    perIp: 5,
    windowMs: 10 * 60_000,
    dailyDefault: 100,
    dailyEnv: "ANALYZE_DAILY_CAP",
  },
};

const buckets = new Map<string, { windowStart: number; count: number }>();
const daily = new Map<RouteId, { day: string; count: number }>();

export interface GuardRejection {
  ok: false;
  status: number;
  message: string;
}

export type GuardResult = { ok: true } | GuardRejection;

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function checkApiGuards(
  route: RouteId,
  ip: string,
  inputChars: number,
  now: number = Date.now()
): GuardResult {
  const cfg = CONFIGS[route];

  if (inputChars > cfg.maxInputChars) {
    return {
      ok: false,
      status: 413,
      message: "That request is too large. Trim it down and try again.",
    };
  }

  const dailyCap = Number(process.env[cfg.dailyEnv]) || cfg.dailyDefault;
  const today = dayOf(now);
  const d = daily.get(route);
  if (d && d.day === today && d.count >= dailyCap) {
    return {
      ok: false,
      status: 429,
      message:
        "The helper hit today's usage cap. It resets tomorrow — meanwhile the symptom menu and diagrams still work offline.",
    };
  }

  const key = `${route}:${ip}`;
  const bucket = buckets.get(key);
  if (bucket && now - bucket.windowStart < cfg.windowMs) {
    if (bucket.count >= cfg.perIp) {
      return {
        ok: false,
        status: 429,
        message: "Slow down a little — try again in a few minutes.",
      };
    }
    bucket.count++;
  } else {
    buckets.set(key, { windowStart: now, count: 1 });
  }

  if (d && d.day === today) d.count++;
  else daily.set(route, { day: today, count: 1 });

  return { ok: true };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

/** Test hook — guards are module-scope in-memory state. */
export function _resetApiGuards(): void {
  buckets.clear();
  daily.clear();
}

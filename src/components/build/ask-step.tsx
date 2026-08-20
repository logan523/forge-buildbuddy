"use client";

/**
 * "Ask about this step" (E2) — a beginner types any question and gets an
 * answer grounded in the SAME derived facts the screen shows. Submit disables
 * in-flight; navigating steps aborts the request (F4); every failure fails
 * closed to the offline symptom menu.
 */

import { useEffect, useRef, useState } from "react";
import type { BuildStep, Part } from "@/lib/types";
import { diagLog } from "@/lib/diag";

export function AskAboutStep({
  step,
  parts,
  onOpenUnstick,
  skillDigest,
  skillsForHelp,
  realityDigest,
}: {
  step: BuildStep;
  parts: Part[];
  onOpenUnstick: () => void;
  /** Optional skills matched for this step (P1.2) — shown as a quiet hint. */
  skillDigest?: string;
  /** Full skill guidance for /api/step-help (P2). */
  skillsForHelp?: string;
  /** The builder's own bench state (BuildReality digest) — makes answers about THEIR build, not a generic one. */
  realityDigest?: string;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Step change aborts any in-flight ask and clears the thread (F4).
  useEffect(() => {
    setQuestion("");
    setAnswer(null);
    setError(null);
    setBusy(false);
    return () => abortRef.current?.abort();
  }, [step.stepNumber]);

  const ask = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setAnswer(null);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/step-help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question: q,
          stepTitle: step.title,
          stepGoal: step.goal || step.quickSummary,
          connections: step.compiled?.connections?.map((c) => ({
            colorName: c.colorName,
            fromLabel: c.fromLabel,
            fromPin: c.fromPin,
            toLabel: c.toLabel,
            toPin: c.toPin,
            netName: c.netName,
          })),
          checks: step.compiled?.checks,
          partsDigest: parts
            .slice(0, 16)
            .map((p) => p.name)
            .join(" · "),
          skillsDigest: skillsForHelp || skillDigest || undefined,
          realityDigest: realityDigest || undefined,
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) {
        setError(data.error || "The helper isn't available right now.");
        diagLog("api_error", `step-help ${res.status}`);
      } else {
        setAnswer(data.answer);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError("The helper isn't reachable right now.");
        diagLog("api_error", `step-help network: ${String(e)}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-2">
      {skillDigest ? (
        <p
          className="text-[11px] text-text-muted leading-snug mb-1.5 line-clamp-2"
          title={skillDigest}
        >
          Skills ready: {skillDigest}
        </p>
      ) : null}
      <div className="flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          maxLength={500}
          placeholder="Ask about this step… e.g. which end is SDA?"
          aria-label="Ask a question about this step"
          className="flex-1 min-w-0 px-3 py-2.5 min-h-11 rounded-xl border border-border-subtle bg-surface text-sm text-text placeholder:text-text-muted"
        />
        <button
          type="button"
          onClick={ask}
          disabled={busy || !question.trim()}
          className="px-4 min-h-11 rounded-xl bg-surface border border-border text-sm text-text-secondary cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-surface-overlay whitespace-nowrap"
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </div>
      {answer && (
        <div className="mt-2 p-3 rounded-xl bg-info-soft/50 border border-info/20">
          <p className="text-[10px] font-semibold text-info uppercase tracking-wider mb-1">
            Grounded in this step&apos;s connections
          </p>
          <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-text-secondary">
          {error}{" "}
          <button
            type="button"
            onClick={onOpenUnstick}
            className="underline text-warning cursor-pointer"
          >
            Open the symptom menu
          </button>
        </p>
      )}
    </div>
  );
}

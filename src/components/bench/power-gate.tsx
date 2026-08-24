"use client";

/**
 * Before you plug it in.
 *
 * "clearly I dont understand how to plug thigns in in the correct place on a
 * breadboard, how can you properly help me so this things doesnt burst into
 * flames." This is the answer to that sentence.
 *
 * SOFT, with friction. It fills up as things get proven rather than standing
 * in the way, and the override is always there — demoted, two taps, honest
 * about what to watch. A gate that hard-blocks a builder with no way through
 * gets clicked past or abandoned, and either way it stops protecting anyone.
 *
 * Fail-closed on unknowns, though: reality that hasn't hydrated, or a wire
 * nobody has declared, reads UNKNOWN and never "clean". The gate exists to
 * prevent the hot-ESP moment, so "we haven't checked" must not look safe.
 */

import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { commitReality, type BuildReality } from "@/lib/build-reality";
import { acknowledgeOverride, prePowerGate, type GateRow } from "@/lib/build-reality/pre-power";
import { detectCapability } from "@/lib/capability";

const MARK: Record<GateRow["state"], string> = {
  pass: "✓",
  pending: "·",
  unknown: "?",
  unavailable: "—",
};

const TONE: Record<GateRow["state"], string> = {
  pass: "text-success",
  pending: "text-text-muted",
  unknown: "text-warning",
  unavailable: "text-text-muted",
};

export function PowerGate({
  plan,
  reality,
  onClose,
}: {
  plan: BuildPlan;
  reality: BuildReality;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const cap = useMemo(() => detectCapability(), []);
  const verdict = useMemo(() => prePowerGate(plan, reality, cap), [plan, reality, cap]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Before power on">
      <button className="absolute inset-0 bg-black/30 cursor-pointer" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-md bg-surface-raised border-l border-border-subtle overflow-y-auto">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">Before you plug it in</h2>
          <button onClick={onClose} className="text-sm text-text-muted cursor-pointer min-h-[44px] px-2">
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-text-secondary">
            This check exists so nothing gets hot. It isn&apos;t a test you pass — it&apos;s what we
            can and can&apos;t currently see.
          </p>

          <ul className="space-y-2">
            {verdict.rows.map((r) => (
              <li key={r.id} className="flex gap-2.5 items-start">
                <span className={`font-mono text-sm ${TONE[r.state]}`} aria-hidden>
                  {MARK[r.state]}
                </span>
                <span>
                  <span className="text-sm text-text">{r.label}</span>
                  <span className="block text-xs text-text-muted">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {verdict.status === "safe" ? (
            <p className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success font-medium">
              Everything we can check looks right. Go ahead.
            </p>
          ) : (
            <div className="rounded-lg border border-warning/30 bg-warning-soft p-3 space-y-1">
              <p className="text-sm font-semibold text-warning">
                {verdict.status === "blocked" ? "Something's wrong here" : "Some things aren't confirmed"}
              </p>
              {/* Already human-labelled by the gate; raw net names never reach here. */}
              <ul className="text-xs text-text list-disc pl-4">
                {verdict.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {/* The override. Demoted, never hidden — and logged forever. */}
          {verdict.status !== "safe" &&
            (confirming ? (
              <div className="space-y-2 rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-text">
                  Power it on anyway. Keep a hand near the plug: if anything gets warm, smells
                  sharp, or the board resets over and over, pull power immediately.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      commitReality(
                        acknowledgeOverride(reality, `powered on with: ${verdict.blockers.join("; ") || "unconfirmed checks"}`)
                      );
                      onClose();
                    }}
                    className="text-xs px-3 py-2 rounded-lg border border-warning text-warning cursor-pointer min-h-[44px]"
                  >
                    I understand — power it on
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-xs px-3 py-2 text-text-muted cursor-pointer min-h-[44px]"
                  >
                    Go back
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="text-xs text-text-muted underline underline-offset-2 cursor-pointer min-h-[44px]"
              >
                Power on without these checks
              </button>
            ))}
        </div>
      </aside>
    </div>
  );
}

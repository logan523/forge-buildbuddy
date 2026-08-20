"use client";

/**
 * The pre-power gate card (Slice 3, A5/D2/E12) — the reassurance ritual
 * before anything gets plugged in. SOFT: green rows accumulate; the
 * override is explicit, demoted below the checklist, honest about what to
 * watch, and logged forever. Never a locked door — the transcript's builder
 * abandons surfaces that block him without warmth.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import type { BuildPlan } from "@/lib/types";
import { detectCapability } from "@/lib/capability";
import { prePowerGate, acknowledgeOverride } from "@/lib/build-reality/pre-power";
import { commitReality, readReality, subscribeReality } from "@/lib/build-reality";
import { BOARD_SPECS, type BoardSpec } from "@/lib/breadboard/spec";
import { checkBreadboard } from "@/lib/breadboard/erc";

const ROW_ICON: Record<string, string> = { pass: "✓", pending: "○", unknown: "?", unavailable: "–" };
const ROW_CLS: Record<string, string> = {
  pass: "text-success",
  pending: "text-warning",
  unknown: "text-warning",
  unavailable: "text-console-text-muted",
};

export function PrePowerGateCard({ plan }: { plan: BuildPlan }) {
  const reality = useSyncExternalStore(subscribeReality, () => readReality(plan.id), () => undefined);
  const [confirmingOverride, setConfirmingOverride] = useState(false);
  const capability = useMemo(() => detectCapability(), []);

  const verdict = useMemo(() => {
    const bbVerdict =
      reality?.formFactor === "breadboard" && reality.breadboard
        ? checkBreadboard(
            BOARD_SPECS[reality.breadboard.boardId as BoardSpec["id"]] ?? BOARD_SPECS["half-400"],
            reality.breadboard.declarations
          )
        : undefined;
    return prePowerGate(plan, reality, capability, bbVerdict);
  }, [plan, reality, capability]);

  const overridden = reality?.events.some((e) => e.kind === "gate-override") ?? false;

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        verdict.status === "safe"
          ? "border-success/40 bg-success/10"
          : verdict.status === "blocked"
            ? "border-danger/40 bg-danger-soft/30"
            : "border-console-border bg-console-surface"
      }`}
      data-testid="pre-power-gate"
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-console-text-muted">Before you power on</p>
        <p className="text-sm text-console-text mt-0.5">
          {verdict.status === "safe"
            ? "Everything checks out — safe to plug in. This is the moment."
            : "This check exists so nothing gets hot — a minute here beats a fried board."}
        </p>
      </div>
      <ul className="space-y-2">
        {verdict.rows.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5">
            <span className={`shrink-0 w-5 text-center font-bold ${ROW_CLS[r.state]}`} aria-hidden>
              {ROW_ICON[r.state]}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-console-text">{r.label}</span>
              <span className="block text-xs text-console-text-muted leading-snug">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      {verdict.status !== "safe" && reality && !overridden && (
        <div className="pt-1 border-t border-console-border/60">
          {confirmingOverride ? (
            <div className="space-y-2">
              <p className="text-xs text-console-text-muted leading-snug">
                Powering on without the checks: keep a finger near the plug, and if anything
                smells hot or the board warms fast, pull power immediately — nothing is ruined
                as long as you're quick.
              </p>
              <button
                type="button"
                onClick={() => commitReality(acknowledgeOverride(reality, "powered on without completing pre-power checks"))}
                className="text-xs font-semibold text-warning min-h-11 px-2 cursor-pointer hover:underline"
              >
                I understand — power on anyway
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingOverride(true)}
              className="text-xs text-console-text-muted min-h-11 px-1 cursor-pointer hover:text-console-text"
            >
              Power on without checks…
            </button>
          )}
        </div>
      )}
      {overridden && verdict.status !== "safe" && (
        <p className="text-xs text-console-text-muted">
          You chose to power on without the full checks — that's on record; the rows above stay live if you want them.
        </p>
      )}
    </div>
  );
}

/**
 * The power-on SUCCESS moment (design D11) — "holy shit its lighting up"
 * was the emotional peak of the real build, and the product celebrated
 * nothing. Distinct from the all-steps-complete card: this fires the moment
 * the power-on step itself is marked done.
 */
export function PowerOnCelebration() {
  return (
    <div className="rounded-xl border border-success/40 bg-success/10 p-5 text-center space-y-1.5" data-testid="power-on-celebration">
      <p className="text-2xl" aria-hidden>⚡</p>
      <p className="text-lg font-bold text-console-text">It's alive.</p>
      <p className="text-sm text-console-text-muted leading-snug">
        That light is electrons doing exactly what you told them to. Every joint you made is
        carrying real current right now — this is the moment the whole build was for.
      </p>
    </div>
  );
}

/** The power-on moment: a battery/power/plug step late in the build. */
export function isPowerOnStep(title: string | undefined): boolean {
  return !!title && /\b(power (it )?on|plug (it )?in|connect the battery|first power|bring .* to life)\b/i.test(title);
}

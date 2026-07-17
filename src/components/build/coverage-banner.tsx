"use client";

/**
 * Coverage banner — the beginner-facing surface for the instruction
 * compiler's coverage channel (plan.compiledFacts), kept strictly separate
 * from the red safety banner (SafetyFinding). Channel discipline, per the
 * comment atop steps/validate.ts: a genuine safety contradiction
 * (STEP_SAFETY_CONTRADICTION) is never double-reported here — the safety
 * channel already owns it.
 *
 *   CoverageBanner — slim inline nudge; null when there's nothing to review
 *                    (the common case — most plans are fully covered).
 *   CoverageDetail — the drawer CONTENT (not the shell) the banner's Review
 *                    button opens: every unassigned connection rendered
 *                    ConnectionsTable-style, plus any remaining validator
 *                    issues translated out of internal jargon.
 *
 * STEP_NET_UNCOVERED is deliberately excluded everywhere below: it's always
 * a plan-level restatement of the exact same `facts.unassigned` list (see
 * validate.ts findUncoveredNets, which reads compiledFacts.unassigned
 * directly to build its one summary issue) — counting or listing it again
 * would double-report the same uncovered wires a second time.
 */

import type { CompiledConnection, CompiledPlanFacts, StepContentIssue } from "@/lib/types";
import { Button } from "@/components/ui";

export interface CoverageBannerProps {
  facts: CompiledPlanFacts | undefined;
  onReview: () => void;
}

function reviewableIssues(facts: CompiledPlanFacts): StepContentIssue[] {
  return facts.issues.filter(
    (i) => i.id !== "STEP_SAFETY_CONTRADICTION" && i.id !== "STEP_NET_UNCOVERED"
  );
}

/** Slim inline nudge for the build view. Renders null when the plan is clean. */
export function CoverageBanner({ facts, onReview }: CoverageBannerProps) {
  if (!facts) return null;
  const n = facts.unassigned.length + reviewableIssues(facts).length;
  if (n === 0) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-warning-soft border border-warning/25"
    >
      <p className="text-xs text-text leading-snug">
        <span aria-hidden>⚠</span> {n} connection{n === 1 ? "" : "s"} not covered by any step —
      </p>
      <Button variant="ghost" size="sm" onClick={onReview} className="shrink-0">
        Review
      </Button>
    </div>
  );
}

/* ── Plain-language issue translations ──────────────────────────────────── */

function firstQuoted(detail: string): string | null {
  const m = detail.match(/"([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Beginner translations per validator issue kind (steps/validate.ts). Kept
 * exhaustive over the full StepContentIssue["id"] union for type safety,
 * even though STEP_SAFETY_CONTRADICTION / STEP_NET_UNCOVERED never reach
 * translateIssue below (reviewableIssues filters them first) — belt and
 * suspenders against a future direct caller.
 */
const kindToPlainLanguage: Record<StepContentIssue["id"], (issue: StepContentIssue) => string> = {
  STEP_UNKNOWN_PIN: (issue) => {
    const pin = firstQuoted(issue.detail);
    const who = issue.stepNumber ? `Step ${issue.stepNumber}` : "A step";
    return pin
      ? `${who} mentions pin "${pin}", which isn't labeled on any part in this plan — trust the text printed on the part, not a guessed pin number.`
      : issue.detail;
  },
  STEP_COLOR_MISMATCH: (issue) => {
    const who = issue.stepNumber ? `Step ${issue.stepNumber}` : "One of the instructions";
    return `${who} names a wire color that doesn't match what's actually wired here — trust the color swatch above, not the wording.`;
  },
  STEP_NET_UNCOVERED: () =>
    "Some connections aren't called out by name in any step — see the list above.",
  STEP_SAFETY_CONTRADICTION: (issue) => issue.detail,
};

function translateIssue(issue: StepContentIssue): string {
  return kindToPlainLanguage[issue.id]?.(issue) ?? issue.detail;
}

/* ── Row mirror ────────────────────────────────────────────────────────────
 * Same visual signature as step-facts.tsx's ConnectionsTable row (color
 * swatch + name, from · pin → to · pin) over the same CompiledConnection
 * shape — mirrored rather than imported because ConnectionsTable's header
 * ("Connections — derived from your wiring plan") and full table chrome
 * don't fit this "here's what's missing" context.
 */
function UncoveredRow({ c }: { c: CompiledConnection }) {
  return (
    <tr className="border-t border-border-subtle first:border-t-0">
      <td className="pl-3 pr-2 py-2 whitespace-nowrap align-middle">
        <span
          aria-hidden
          className="inline-block w-3 h-3 rounded ring-1 ring-black/15 align-[-1px] mr-1.5"
          style={{ background: c.colorHex }}
        />
        <span className="font-semibold text-text">{c.colorName}</span>
      </td>
      <td className="px-2 py-2 font-mono text-[11px] text-text-secondary leading-snug">
        {c.fromLabel} · <span className="font-bold text-text">{c.fromPin}</span>
        <span aria-hidden> → </span>
        <span className="sr-only"> to </span>
        {c.toLabel} · <span className="font-bold text-text">{c.toPin}</span>
      </td>
    </tr>
  );
}

export interface CoverageDetailProps {
  facts: CompiledPlanFacts | undefined;
}

/** The drawer CONTENT only — wrap in a shell (e.g. DrawerShell from src/components/ui) to present it. */
export function CoverageDetail({ facts }: CoverageDetailProps) {
  const unassigned = facts?.unassigned ?? [];
  const issues = facts ? reviewableIssues(facts) : [];

  if (unassigned.length === 0 && issues.length === 0) {
    return (
      <p className="text-sm text-text-secondary">Nothing to review — every connection is covered.</p>
    );
  }

  return (
    <div className="space-y-4">
      {unassigned.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Not yet mentioned in a step
          </p>
          <div className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {unassigned.map((c, i) => (
                  <UncoveredRow key={`${c.id}-${i}`} c={c} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            These wires are in the plan, but no step&apos;s instructions mention them by name yet —
            they still need to get built.
          </p>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Worth a look
          </p>
          <ul className="space-y-1.5">
            {issues.map((issue, i) => (
              <li
                key={i}
                className="text-xs text-text-secondary leading-relaxed pl-2 border-l-2 border-warning/30"
              >
                {translateIssue(issue)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

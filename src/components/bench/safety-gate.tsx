"use client";

/**
 * What can hurt you, before you can start.
 *
 * The previous rebuild commit deleted the prep screen and took this with it.
 * On a plan carrying a LiPo cell that was a real regression: the warning that
 * says "never short + and −, connect the battery last" had nowhere to render.
 *
 * Deliberately NOT a wall. The old prep screen put 823 DOM nodes and eleven
 * parts' worth of shopping in front of a builder before they could see a
 * single instruction, and the thing they most needed to read was somewhere in
 * the middle of it. This is the hazards, the acknowledgement, and nothing
 * else — the parts live on their own surface, reachable whenever.
 *
 * It only appears for hazards that actually gate a build (lithium, mains,
 * high current). A soldering-iron warning does not get to interrupt anyone.
 */

import type { BuildPlan } from "@/lib/types";
import { hazardLabel, isBlockingHazard, needsSafetyAck } from "@/lib/hazards";

export function SafetyGate({
  plan,
  onAcknowledge,
  onHome,
}: {
  plan: BuildPlan;
  onAcknowledge: () => void;
  onHome: () => void;
}) {
  const tags = plan.safetyReport?.hazardTags ?? plan.hazardTags ?? [];
  const blocking = tags.filter(isBlockingHazard);
  const findings = (plan.safetyReport?.findings ?? []).filter(
    (f) => f.severity === "critical" || f.severity === "warning"
  );
  // Authored warnings are the plan's own words and are often the most specific
  // thing available ("connect the battery last, after every other joint is
  // checked"). They render alongside derived findings, never instead of them.
  const warnings = plan.warnings ?? [];

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-surface">
      <header className="shrink-0 px-5 py-3 border-b border-border-subtle flex items-center justify-between">
        <button onClick={onHome} className="text-sm text-text-muted hover:text-text cursor-pointer">
          ← Home
        </button>
        <span className="text-sm font-medium text-text truncate">{plan.title}</span>
        <span className="w-12" />
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-8 max-w-2xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">Read this first</h1>
          <p className="text-text-muted mt-1">
            This build has {blocking.length === 1 ? "a risk" : "risks"} worth knowing about before
            you pick anything up.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {blocking.map((t) => (
            <span
              key={t}
              className="text-xs font-semibold px-2.5 py-1 rounded-sm bg-danger-soft text-danger border border-danger/20"
            >
              {hazardLabel(t)}
            </span>
          ))}
        </div>

        <ul className="space-y-3">
          {warnings.map((w, i) => (
            <li key={`w${i}`} className="rounded-lg border border-border-subtle p-4 text-sm text-text">
              {w}
            </li>
          ))}
          {findings.map((f) => (
            <li key={f.id} className="rounded-lg border border-border-subtle p-4 space-y-1">
              <p className="text-sm font-semibold text-text">{f.title}</p>
              <p className="text-xs text-text-secondary">{f.detail}</p>
              {f.mitigation && (
                <p className="text-xs text-text">
                  <span className="font-medium">Do this:</span> {f.mitigation}
                </p>
              )}
            </li>
          ))}
        </ul>

        {warnings.length === 0 && findings.length === 0 && (
          <p className="text-sm text-text-muted italic">
            We flagged {blocking.map(hazardLabel).join(" and ")} for this build but have no
            specific guidance recorded — treat it with the care that name implies.
          </p>
        )}

        <button
          onClick={onAcknowledge}
          className="w-full px-5 py-3 rounded-lg bg-accent text-white font-semibold cursor-pointer min-h-[44px]"
        >
          I&apos;ve read this — start building
        </button>
      </main>
    </div>
  );
}

export { needsSafetyAck };

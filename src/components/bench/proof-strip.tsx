"use client";

/**
 * What we actually know about this joint, and what we don't.
 *
 * The distinction this renders is the one the real build turned on: ticking a
 * checkbox is an ASSERTION; the board answering at 0x3C is EVIDENCE. Collapsing
 * them is how a product ends up telling someone their wiring is fine right
 * before it gets hot.
 *
 * Three states, never four, and never a silent one:
 *
 *   not done yet   nothing claimed
 *   you did it     he said so — real, and weaker than a measurement
 *   proven live    an instrument answered
 */

import type { CursorAction } from "@/lib/actions/cursor";
import type { BuildReality } from "@/lib/build-reality";

type Stage = "planned" | "asserted" | "proven";

function stageOf(a: CursorAction, reality?: BuildReality): Stage {
  const joint = reality?.joints[a.id];
  if (joint?.state === "verified") return "proven";
  if (joint?.state === "made" || joint?.state === "placed") return "asserted";
  return "planned";
}

const COPY: Record<Stage, { label: string; hint: string }> = {
  planned: { label: "not done yet", hint: "" },
  asserted: {
    label: "you did it",
    hint: "your word — plug the board in to prove it",
  },
  proven: { label: "proven live", hint: "the board answered" },
};

export function ProofStrip({
  action,
  reality,
  canGoLive,
}: {
  action: CursorAction;
  reality?: BuildReality;
  /** False on browsers without Web Serial — the copy degrades instead of lying. */
  canGoLive: boolean;
}) {
  const stage = stageOf(action, reality);
  const copy = COPY[stage];
  const order: Stage[] = ["planned", "asserted", "proven"];

  return (
    <div className="flex items-center gap-3 text-xs" aria-label="Proof">
      <div className="flex items-center gap-1.5" role="img" aria-label={copy.label}>
        {order.map((s, i) => {
          const reached = order.indexOf(stage) >= i;
          return (
            <span
              key={s}
              className={`h-1.5 w-6 rounded-full ${
                reached ? (stage === "proven" ? "bg-success" : "bg-text-muted") : "bg-border-subtle"
              }`}
            />
          );
        })}
      </div>
      <span className={stage === "proven" ? "text-success font-medium" : "text-text-muted"}>
        {copy.label}
      </span>
      {copy.hint && (
        <span className="text-text-muted">
          ·{" "}
          {stage === "asserted" && !canGoLive
            ? "your word — a desktop Chrome or Edge browser can check this against the board"
            : copy.hint}
        </span>
      )}
    </div>
  );
}

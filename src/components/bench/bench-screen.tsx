"use client";

/**
 * The bench. One screen, one action, one picture, one way forward.
 *
 * What it replaces: a 830-line component holding two independent layouts with
 * different colour languages, selected by `microSteps.length > 0`, so crossing
 * from a mechanical step to a wiring step was a full application skin change.
 * Around it, 11 competing progress readings over 4 unreconciled stores, 8 ways
 * to change step, and the same netlist drawn six different ways.
 *
 * The counts here are the design:
 *
 *   1 progress reading   from the cursor, which is the only thing that knows
 *   1 picture            the whole circuit with this wire lit — the abstract
 *                        one-wire pad map tested badly ("kinda fucking sucks")
 *   1 forward action     "I did it" advances the cursor; chapters are a sheet
 *                        you open, not a second navigation
 *
 * Everything else is reachable, nothing else is in the way.
 */

import { useMemo, useState } from "react";
import type { BuildPlan } from "@/lib/types";
import { buildActionCursor } from "@/lib/actions/cursor";
import {
  commitReality,
  emptyReality,
  setJointState,
  sortEndpoints,
  type BuildReality,
} from "@/lib/build-reality";
import { svgCircuitDiagram } from "@/lib/step-media/circuit-diagram";
import { detectCapability } from "@/lib/capability";
import { planCostClaim } from "@/lib/cost";
import { Fact } from "@/components/claim/fact";
import { ActionCard } from "./action-card";
import { ProofStrip } from "./proof-strip";
import { DeclareColor } from "./declare-color";
import { DeclareHole } from "./declare-hole";
import { ChapterSheet } from "./chapter-sheet";
import { PartsSheet } from "./parts-sheet";
import { PowerGate } from "./power-gate";

export function BenchScreen({
  plan,
  reality,
  onHome,
  onOpenLiveCheck,
  onOpenStuck,
}: {
  plan: BuildPlan;
  reality: BuildReality;
  onHome: () => void;
  onOpenLiveCheck: () => void;
  onOpenStuck: (symptomId?: string) => void;
}) {
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [partsOpen, setPartsOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const cursor = useMemo(() => buildActionCursor(plan, reality), [plan, reality]);
  const canGoLive = useMemo(() => detectCapability().webSerial, []);
  const a = cursor.current;

  // One picture: the whole circuit, this wire lit, everything already made
  // shown as done. Derived from the same netlist as the words above it, so
  // they cannot disagree.
  const diagram = useMemo(
    () =>
      svgCircuitDiagram(plan, {
        highlightWireIds: a ? [a.id] : [],
        doneWireIds: cursor.actions.filter((x) => x.state === "made" || x.verified).map((x) => x.id),
      }),
    [plan, a, cursor.actions]
  );

  const markDone = () => {
    if (!a) return;
    commitReality(
      setJointState(
        reality.planId ? reality : emptyReality(plan.id),
        {
          connectionId: a.id,
          netName: a.connection.netName,
          netClass: a.connection.netClass,
          endpoints: sortEndpoints(
            { ref: a.connection.fromRef, pin: a.connection.fromPin },
            { ref: a.connection.toRef, pin: a.connection.toPin }
          ),
        },
        "made"
      )
    );
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-surface">
      {/* One header, one progress reading. */}
      <header className="shrink-0 px-5 py-3 border-b border-border-subtle flex items-center justify-between gap-3">
        <button onClick={onHome} className="text-sm text-text-muted hover:text-text cursor-pointer">
          ← Home
        </button>
        <div className="min-w-0 text-center">
          <p className="text-sm font-medium text-text truncate">{plan.title}</p>
          <p className="text-xs text-text-muted">
            {cursor.madeCount} of {cursor.actions.length} done
            {cursor.verifiedCount > 0 && ` · ${cursor.verifiedCount} proven live`}
          </p>
        </div>
        <button
          onClick={() => setPartsOpen(true)}
          className="text-xs text-text-muted hover:text-text cursor-pointer shrink-0"
          aria-label="Parts and prices"
        >
          <Fact claim={planCostClaim(plan)} />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl w-full mx-auto space-y-6">
        {a ? (
          <>
            <p className="text-xs uppercase tracking-wide text-text-muted">
              Wire {a.index + 1} of {a.total} · {a.stepTitle}
            </p>
            <ActionCard action={a} reality={reality} />
            {/* Inline, under the sentence it corrects — not behind a drawer. */}
            <DeclareColor action={a} reality={reality} />
            <DeclareHole action={a} reality={reality} />
            <ProofStrip action={a} reality={reality} canGoLive={canGoLive} />
            {/* One hero picture. On a breadboard the board sheet above IS the
                picture, so the circuit demotes to on-demand rather than
                putting two drawings of one wire side by side. */}
            {reality.formFactor === "breadboard" ? (
              <details>
                <summary className="text-xs text-text-muted cursor-pointer min-h-[44px] flex items-center">
                  Show the whole circuit
                </summary>
                <div
                  className="mt-2 rounded-lg border border-border-subtle overflow-x-auto bg-surface-raised p-2"
                  dangerouslySetInnerHTML={{ __html: diagram }}
                />
              </details>
            ) : (
              <div
                className="rounded-lg border border-border-subtle overflow-x-auto bg-surface-raised p-2"
                // Derived from the netlist by svgCircuitDiagram; no user text reaches it.
                dangerouslySetInnerHTML={{ __html: diagram }}
              />
            )}
          </>
        ) : (
          <div className="text-center py-16 space-y-2">
            <p className="text-2xl font-semibold text-text">Every wire is done.</p>
            <p className="text-text-muted">
              {cursor.verifiedCount} of {cursor.actions.length} proven by the board itself.
            </p>
            {canGoLive && (
              <button
                onClick={() => setGateOpen(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold cursor-pointer"
              >
                Before I plug it in…
              </button>
            )}
          </div>
        )}
      </main>

      {/* One forward action. Chapters open a sheet; they are not a second nav. */}
      <footer className="shrink-0 border-t border-border-subtle px-5 py-3 flex items-center gap-2">
        <button
          onClick={() => setChaptersOpen(true)}
          className="text-sm text-text-muted hover:text-text px-3 py-2 cursor-pointer min-h-[44px]"
        >
          All steps
        </button>
        <div className="flex-1" />
        <button
          onClick={() => onOpenStuck(a?.micro?.rescueSymptomId)}
          className="text-sm text-text-muted hover:text-text px-3 py-2 cursor-pointer min-h-[44px]"
        >
          I'm stuck
        </button>
        {canGoLive && (
          <button
            onClick={onOpenLiveCheck}
            className="text-sm px-3 py-2 rounded-lg border border-border-subtle cursor-pointer min-h-[44px]"
          >
            Prove it
          </button>
        )}
        <button
          onClick={markDone}
          disabled={!a}
          className="px-5 py-2 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-40 cursor-pointer min-h-[44px]"
        >
          I did it
        </button>
      </footer>

      {chaptersOpen && <ChapterSheet cursor={cursor} onClose={() => setChaptersOpen(false)} />}
      {partsOpen && <PartsSheet plan={plan} onClose={() => setPartsOpen(false)} />}
      {gateOpen && (
        <PowerGate plan={plan} reality={reality} onClose={() => { setGateOpen(false); onOpenLiveCheck(); }} />
      )}
    </div>
  );
}

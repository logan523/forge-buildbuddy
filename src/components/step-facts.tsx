"use client";

/**
 * Fact blocks rendered from DERIVED data (step.compiled) — never from prose.
 *
 *   ConnectionsTable  — both ends of every wire, silkscreen pins, authority
 *                       colors (swatch + NAME: color is never the sole channel)
 *   CheckYourWorkCard — doneWhen headline; measurable list = compiled checks
 *                       first, then non-duplicate verification lines (3A)
 *   ActionChecklist   — per-action checkboxes; all checked → auto-complete;
 *                       unchecking never un-completes (F4)
 *   GlossaryText      — jargon becomes tap-popovers (keyboard operable)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { BuildStep, CompiledStepFacts } from "@/lib/types";
import type { StepAction } from "@/lib/types";
import type { FirmwarePackage } from "@/lib/firmware";
import { glossarySegments } from "@/lib/glossary";
import { resolveDoneWhen } from "@/lib/steps/instruction";
import { loadActionChecks, saveActionChecks } from "@/lib/storage";
import { diagLog } from "@/lib/diag";

/* ── GlossaryText ─────────────────────────────────────────────────────── */

export function GlossaryText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const segments = useMemo(() => glossarySegments(text), [text]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.tip ? (
          <span key={i} className="relative inline-block">
            <button
              type="button"
              aria-expanded={open === seg.text}
              aria-label={`What is ${seg.text}?`}
              onClick={() => setOpen(open === seg.text ? null : seg.text)}
              className="underline decoration-dotted decoration-accent/60 underline-offset-2 cursor-help text-inherit"
            >
              {seg.text}
            </button>
            {open === seg.text && (
              <span
                role="tooltip"
                className="absolute left-0 bottom-full mb-1.5 z-40 w-64 p-3 rounded-xl bg-gray-900 text-white text-xs leading-relaxed shadow-raised"
              >
                {seg.tip}
              </span>
            )}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </span>
  );
}

/* ── ConnectionsTable ─────────────────────────────────────────────────── */

export function ConnectionsTable({ compiled }: { compiled: CompiledStepFacts }) {
  if (!compiled.connections.length) return null;
  return (
    <div className="rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden">
      <p className="px-3 pt-2.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
        Connections — derived from your wiring plan
      </p>
      <table className="w-full text-xs">
        <tbody>
          {compiled.connections.map((c, i) => (
            <tr key={`${c.netName}-${c.toRef}-${i}`} className="border-t border-border-subtle first:border-t-0">
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
                {c.domainLabel && (
                  <span
                    className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[9px] font-sans font-semibold align-[1px]"
                    style={{
                      color: c.domainColorHex,
                      background: `${c.domainColorHex}1a`,
                      border: `1px solid ${c.domainColorHex}55`,
                    }}
                    title={`This wire carries the ${c.domainLabel} domain`}
                  >
                    {c.domainLabel}
                  </span>
                )}
              </td>
              <td className="pr-3 py-2 text-right align-middle">
                <span
                  className="text-[9px] uppercase tracking-wider text-text-muted"
                  title={
                    c.grade === "derived"
                      ? "One leg of a shared net — physically it may daisy-chain"
                      : "Rendered exactly as wired in the plan"
                  }
                >
                  {c.grade}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DomainLegend compiled={compiled} />
      <p className="px-3 pb-2 pt-1 text-[10px] text-text-muted">
        Pins are the labels printed on each board — trust the silkscreen, not the pin position.
      </p>
    </div>
  );
}

/**
 * The 3.3V Island legend: the distinct voltage domains in this step, colored, so
 * a beginner learns to see voltage as islands. Power domains get a "keep them
 * apart" nudge — the whole point of the color language.
 */
function DomainLegend({ compiled }: { compiled: CompiledStepFacts }) {
  const domains = new Map<string, { label: string; color: string }>();
  for (const c of compiled.connections) {
    if (c.domainKey && c.domainLabel && c.domainColorHex) {
      domains.set(c.domainKey, { label: c.domainLabel, color: c.domainColorHex });
    }
  }
  if (domains.size < 2) return null;
  const powerIslands = [...domains.keys()].filter((k) => k === "3v3" || k === "5v" || k === "batt");
  return (
    <div className="px-3 pt-1.5 pb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[9px] uppercase tracking-wider text-text-muted">Voltage islands:</span>
      {[...domains.values()].map((d) => (
        <span key={d.label} className="inline-flex items-center gap-1 text-[10px] text-text-secondary">
          <span
            aria-hidden
            className="inline-block w-2.5 h-2.5 rounded-full ring-1 ring-black/15"
            style={{ background: d.color }}
          />
          {d.label}
        </span>
      ))}
      {powerIslands.length >= 2 && (
        <span className="text-[10px] text-warning w-full">
          ⚠ Different power colors are different voltages — never bridge them, or you can fry a part.
        </span>
      )}
    </div>
  );
}

/* ── CheckYourWorkCard ────────────────────────────────────────────────── */

// Standalone measurement values only — "GPIO4" must not leak a 4.
const numberTokens = (s: string) =>
  new Set((s.match(/(?<![A-Za-z0-9.])\d+(?:\.\d+)?(?![0-9])/g) || []).map(Number));

/** 3A precedence: compiled checks first; verification lines only if they add new values. */
export function checkLines(step: BuildStep): { instruction: string; expected: string }[] {
  const lines: { instruction: string; expected: string }[] = (step.compiled?.checks || []).map(
    (c) => ({ instruction: c.instruction, expected: c.expected })
  );
  const covered = new Set(lines.flatMap((l) => [...numberTokens(l.expected)]));
  for (const raw of (step.verification?.expectedOutput || "").split(/;|\. (?=[A-Z0-9])/)) {
    const line = raw.trim().replace(/\.$/, "");
    if (!line) continue;
    const nums = [...numberTokens(line)];
    const shared = nums.filter((n) => covered.has(n)).length;
    // Duplicate when it re-states a covered measurement band (≥2 shared
    // values = a range match) or is a single already-covered value.
    const isDuplicate = shared >= 2 || (nums.length === 1 && shared === 1);
    if (isDuplicate) continue;
    nums.forEach((n) => covered.add(n));
    lines.push({ instruction: line, expected: "" });
  }
  return lines;
}

export function CheckYourWorkCard({
  step,
  firmware,
}: {
  step: BuildStep;
  /** Optional — unlocks the sketch-derived doneWhen for software steps (steps/instruction.ts). Undefined by default so every existing call site keeps compiling. */
  firmware?: FirmwarePackage | null;
}) {
  const doneWhen = resolveDoneWhen(step, firmware);
  const lines = checkLines(step);
  return (
    <div className="p-3 rounded-xl bg-success-soft/60 border border-success/20">
      <p className="text-[10px] font-semibold text-success uppercase tracking-wider mb-1">
        ✓ Check your work
      </p>
      <p className="text-sm text-text-secondary leading-relaxed">{doneWhen}</p>
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text">
              <span className="leading-snug">{l.instruction}</span>
              {l.expected && (
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-white border border-success/25 text-success whitespace-nowrap">
                  {l.expected}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── ActionChecklist ──────────────────────────────────────────────────── */

export function ActionChecklist({
  planId,
  stepNumber,
  actions,
  stepCompleted,
  onAutoComplete,
}: {
  planId: string;
  stepNumber: number;
  actions: StepAction[];
  stepCompleted: boolean;
  onAutoComplete: () => void;
}) {
  const [checked, setChecked] = useState<Set<number>>(() => loadActionChecks(planId, stepNumber));
  const autoFired = useRef(false);
  const listRef = useRef<HTMLOListElement>(null);

  // Re-sync when the step changes.
  useEffect(() => {
    setChecked(loadActionChecks(planId, stepNumber));
    autoFired.current = false;
  }, [planId, stepNumber]);

  // E6: scroll the first unchecked action into view when arriving on a step.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-unchecked='true']");
    if (!el || typeof el.scrollIntoView !== "function") return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [stepNumber]);

  const toggle = (n: number) => {
    const next = new Set(checked);
    if (next.has(n)) next.delete(n);
    else next.add(n);
    setChecked(next);
    saveActionChecks(planId, stepNumber, next);
    // F4: checking the LAST box auto-completes; unchecking never un-completes.
    if (
      next.size === actions.length &&
      actions.length > 0 &&
      !stepCompleted &&
      !autoFired.current
    ) {
      autoFired.current = true;
      diagLog("step_complete", `step ${stepNumber} auto-completed via checklist`);
      onAutoComplete();
    }
  };

  if (!actions.length) return null;

  return (
    <fieldset>
      <legend className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
        Do this
      </legend>
      <ol ref={listRef} className="space-y-1.5">
        {actions.map((a) => {
          const isChecked = checked.has(a.n);
          return (
            <li key={a.n} data-unchecked={!isChecked}>
              {/* 44px floor: the whole row is the tap target, not just the
                  ~20px visual checkbox — label wraps input, -mx cancels the
                  horizontal padding so text still lines up with siblings. */}
              <label className="flex gap-3 items-start min-h-11 px-2.5 py-2 -mx-2.5 rounded-lg hover:bg-surface-overlay/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(a.n)}
                  aria-label={`Action ${a.n}: ${a.text}`}
                  className="mt-0.5 w-5 h-5 min-w-5 accent-[#0891b2] cursor-pointer"
                />
                <span className="min-w-0">
                  <GlossaryText
                    text={a.text}
                    className={`text-sm leading-relaxed ${isChecked ? "text-text-muted line-through decoration-border-strong" : "text-text"}`}
                  />
                  {a.caution && <span className="block text-xs text-warning mt-0.5">⚠ {a.caution}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
    </fieldset>
  );
}

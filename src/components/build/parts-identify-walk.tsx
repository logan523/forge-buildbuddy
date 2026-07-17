"use client";

/**
 * "Find It In Your Pile" — the very first moment of dread: a heap of near-
 * identical black boards and no idea what any of them are. This walks the pile
 * one part at a time with its distinguishing tells (size + the one gotcha),
 * same find→confirm rhythm as the guided wire flow, so the build starts from
 * confidence instead of confusion.
 */

import { useMemo, useState } from "react";
import type { Part } from "@/lib/types";
import { partIcon } from "@/components/build-ui";
import { spotTells } from "@/lib/part-identity";

export function PartsIdentifyWalk({
  parts,
  context = "identify",
}: {
  parts: Part[];
  /** "identify" = sorting the pile before building; "confirm" = the order
      arrived and the builder checks they got the RIGHT items (B6). Same
      walk, different framing. */
  context?: "identify" | "confirm";
}) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  const real = useMemo(() => parts.filter((p) => p.name), [parts]);
  if (real.length < 2) return null;

  const cur = real[Math.min(index, real.length - 1)]!;
  const tells = spotTells(cur);
  const doneCount = real.filter((p) => found.has(p.id)).length;
  const allFound = doneCount === real.length;

  const mark = () => {
    const next = new Set(found);
    next.add(cur.id);
    setFound(next);
    const nextUnfound = real.findIndex((p, i) => i > index && !next.has(p.id));
    if (nextUnfound >= 0) setIndex(nextUnfound);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left mb-3 p-3 rounded-xl border border-accent/25 bg-accent/5 hover:bg-accent/10 cursor-pointer transition-colors"
      >
        <p className="text-sm font-medium text-text flex items-center gap-2">
          <span aria-hidden>🔍</span>{" "}
          {context === "confirm"
            ? "Parts arrived? Confirm you got the right ones"
            : "Not sure which is which? Identify your parts"}
        </p>
        <p className="text-xs text-text-muted mt-1 ml-6">
          {context === "confirm"
            ? "One at a time, against what each should look like."
            : "One at a time, with how to spot each in the pile."}
        </p>
      </button>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-border bg-surface p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-text-muted">
          {allFound ? "All found" : `Part ${index + 1} of ${real.length}`}
          {doneCount > 0 && !allFound && <span className="text-success ml-2">· {doneCount} found</span>}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted underline cursor-pointer">
          Done
        </button>
      </div>
      <div className="flex gap-1">
        {real.map((p, i) => (
          <span
            key={p.id}
            className={`h-1.5 flex-1 rounded-full ${found.has(p.id) ? "bg-success" : i === index ? "bg-accent" : "bg-border"}`}
          />
        ))}
      </div>

      {allFound ? (
        <p className="text-sm text-text py-2">
          Every part accounted for. You know your pile — time to build. 🎉
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <span className="text-3xl shrink-0" aria-hidden>
              {partIcon(cur.name, cur.specification)}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-text leading-tight">{cur.name}</p>
              {tells.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {tells.map((t, i) => (
                    <li key={i} className="text-xs text-text-secondary flex gap-1.5">
                      <span aria-hidden className="text-accent">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={mark}
              className="flex-1 min-h-11 rounded-xl bg-accent text-white text-sm font-medium cursor-pointer"
            >
              {found.has(cur.id) ? "✓ Found" : "Found it ✓"}
            </button>
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(real.length - 1, i + 1))}
              disabled={index >= real.length - 1}
              className="px-4 min-h-11 rounded-xl border border-border text-sm text-text-secondary cursor-pointer disabled:opacity-30 disabled:cursor-default"
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}

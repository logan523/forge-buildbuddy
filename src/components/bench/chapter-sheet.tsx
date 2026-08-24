"use client";

/**
 * Where am I in the whole build.
 *
 * Chapters are orientation, not navigation. There is exactly one way to move
 * forward — finishing the current action — so this sheet answers "how much is
 * left" without offering a second, competing cursor. The old build screen had
 * eight ways to change step, several of which silently disagreed about which
 * step you were on.
 */

import type { ActionCursor } from "@/lib/actions/cursor";

export function ChapterSheet({
  cursor,
  onClose,
}: {
  cursor: ActionCursor;
  onClose: () => void;
}) {
  // Group the flat action list back into the chapters it came from.
  const chapters: { stepNumber: number; title: string; total: number; done: number; proven: number }[] = [];
  for (const a of cursor.actions) {
    let ch = chapters.find((c) => c.stepNumber === a.stepNumber);
    if (!ch) {
      ch = { stepNumber: a.stepNumber, title: a.stepTitle, total: 0, done: 0, proven: 0 };
      chapters.push(ch);
    }
    ch.total += 1;
    if (a.state === "made" || a.verified) ch.done += 1;
    if (a.verified) ch.proven += 1;
  }
  const currentStep = cursor.current?.stepNumber;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="All steps">
      <button
        className="absolute inset-0 bg-black/30 cursor-pointer"
        onClick={onClose}
        aria-label="Close"
      />
      <aside className="relative w-full max-w-sm bg-surface-raised border-l border-border-subtle overflow-y-auto">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text">All steps</h2>
          <button onClick={onClose} className="text-sm text-text-muted cursor-pointer min-h-[44px] px-2">
            Close
          </button>
        </div>
        <ol className="p-3 space-y-1">
          {chapters.map((c) => {
            const complete = c.done === c.total;
            return (
              <li
                key={c.stepNumber}
                className={`px-3 py-3 rounded-lg ${
                  c.stepNumber === currentStep ? "bg-accent-soft" : ""
                }`}
                aria-current={c.stepNumber === currentStep ? "step" : undefined}
              >
                <p className="text-sm text-text font-medium">
                  {complete ? "✓ " : ""}
                  {c.title}
                </p>
                <p className="text-xs text-text-muted">
                  {c.done} of {c.total} done
                  {c.proven > 0 && ` · ${c.proven} proven live`}
                </p>
              </li>
            );
          })}
        </ol>
        {chapters.length === 0 && (
          <p className="px-5 py-8 text-sm text-text-muted italic">
            This build has no wiring steps yet.
          </p>
        )}
      </aside>
    </div>
  );
}

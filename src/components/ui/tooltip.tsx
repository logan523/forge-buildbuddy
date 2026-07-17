"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type InfoPopoverAnchor = "inline" | "sheet";

export interface InfoPopoverProps {
  anchor: InfoPopoverAnchor;
  /** Clickable trigger content, wrapped in an accessible toggle button. */
  trigger: ReactNode;
  /** aria-label for the trigger, e.g. "What is SDA?" */
  triggerLabel: string;
  children: ReactNode;
  /** Controlled open state; omit to let the popover manage it internally. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  triggerClassName?: string;
}

// Console family — every dark surface (tooltips included) reads from these
// tokens instead of hardcoded bg-gray-900.
const PANEL =
  "z-40 rounded-xl bg-console-surface text-console-text border border-console-border text-xs leading-relaxed shadow-raised";

/**
 * Merged tap-popover primitive. anchor="inline" anchors near the trigger (the
 * GlossaryText pattern, step-facts.tsx); anchor="sheet" renders a fixed
 * bottom sheet (the global onTooltip pattern, build-screen.tsx). Dismisses on
 * outside click or Esc.
 */
export function InfoPopover({
  anchor,
  trigger,
  triggerLabel,
  children,
  open,
  onOpenChange,
  className = "",
  triggerClassName = "",
}: InfoPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const rootRef = useRef<HTMLSpanElement>(null);

  // Plain closure for click handlers below — never invoked during render.
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!isOpen) return;
    const close = () => {
      if (!isControlled) setInternalOpen(false);
      onOpenChange?.(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen, isControlled, onOpenChange]);

  return (
    <span ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        onClick={() => setOpen(!isOpen)}
        className={`cursor-help text-inherit ${triggerClassName}`}
      >
        {trigger}
      </button>
      {isOpen && anchor === "inline" && (
        <span role="tooltip" className={`absolute left-0 bottom-full mb-1.5 w-64 p-3 ${PANEL}`}>
          {children}
        </span>
      )}
      {isOpen && anchor === "sheet" && (
        <span
          role="tooltip"
          onClick={() => setOpen(false)}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-sm p-4 ${PANEL}`}
        >
          {children}
        </span>
      )}
    </span>
  );
}

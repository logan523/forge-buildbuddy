"use client";

import { useEffect, type ReactNode } from "react";

export interface DrawerShellProps {
  title: string;
  onClose: () => void;
  width?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
}

const WIDTH_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/**
 * Right-side sheet shell — the exact backdrop/panel/header shape already
 * shipping per-drawer in build-drawers.tsx, extracted as one reusable
 * primitive. Esc closes.
 */
export function DrawerShell({ title, onClose, width = "md", children, footer }: DrawerShellProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div
        className={`fixed inset-y-0 right-0 w-full ${WIDTH_CLASS[width]} bg-surface border-l border-border shadow-raised z-50 flex flex-col`}
      >
        <div className="shrink-0 border-b border-border-subtle px-5 py-4 flex items-center justify-between gap-3">
          <h3 className="font-semibold font-serif text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 min-h-11 min-w-11 flex items-center justify-center text-lg text-text-muted hover:text-text cursor-pointer"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">{children}</div>
        {footer && <div className="shrink-0 border-t border-border-subtle px-4 py-3">{footer}</div>}
      </div>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Overlay lifecycle (F4): pushes a history entry so browser Back closes the
 * overlay instead of leaving the build; Esc closes too. Shared by the expand
 * stage, the photo lightbox, and hands-free mode.
 */
export function useOverlay(onClose: () => void, open: boolean) {
  const pushed = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined" || typeof history === "undefined") return;
    history.pushState({ forgeOverlay: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      closeRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      if (pushed.current) {
        pushed.current = false;
        history.back();
      }
    };
  }, [open]);
}

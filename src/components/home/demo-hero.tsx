"use client";

/**
 * Homepage hero (B3) — the product finally SHOWS itself, without shipping
 * three.js in the critical path. The Stage chunk loads only after the hero
 * scrolls into view AND the browser goes idle (or instantly on tap), so the
 * first paint stays text-fast while the curious get the real, orbitable 3D —
 * not a canned video.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BuildPlan } from "@/lib/types";

const LazyStage = dynamic(
  () => import("@/components/stage/stage-app").then((m) => m.StageApp),
  { ssr: false, loading: () => <HeroPlaceholder label="Loading the 3D model…" /> }
);

function HeroPlaceholder({ label }: { label: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-overlay/60">
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

export function DemoHero({ plan }: { plan: BuildPlan }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mount3d, setMount3d] = useState(false);

  // Two rAFs guarantee the 380px container has COMMITTED layout before the
  // Canvas mounts — r3f's first measure races a same-tick dynamic mount and
  // can leave the canvas at its 300x150 default forever.
  const mountAfterLayout = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => setMount3d(true)));

  // Late dynamic mounts can miss R3F's initial container measure (canvas stuck
  // at the 300x150 default). The embedder knows the mount moment — kick a
  // remeasure after the chunk lands and layout settles.
  useEffect(() => {
    if (!mount3d) return;
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event("resize")), 1200);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mount3d]);

  // In-view + idle: never compete with the page's first paint. requestIdleCallback
  // is absent in Safari — a short timeout is an equivalent yield there.
  useEffect(() => {
    if (mount3d || !ref.current || typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(mountAfterLayout);
      else window.setTimeout(mountAfterLayout, 200);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [mount3d]);

  return (
    <div
      ref={ref}
      className="relative rounded-xl border border-border-subtle bg-surface shadow-card overflow-hidden mb-3"
      style={{ height: 380 }}
    >
      {mount3d ? (
        <LazyStage plan={plan} stepIndex="prep" height={380} variant="step" expandable />
      ) : (
        <button
          type="button"
          onClick={mountAfterLayout}
          className="h-full w-full flex flex-col items-center justify-center gap-2 cursor-pointer bg-surface-overlay/40 hover:bg-surface-overlay/70 transition-colors"
        >
          <span className="text-sm font-semibold text-text">{plan.title}</span>
          <span className="text-xs text-text-muted">
            {plan.parts.length} parts · {plan.steps.length} steps · {plan.estimatedCost}
          </span>
          <span className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-medium">
            See it in 3D
          </span>
        </button>
      )}
    </div>
  );
}

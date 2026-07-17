"use client";

/**
 * /dev/stage — the Stage development harness.
 *
 * dynamic(ssr:false) is the code-split boundary: the entire three.js / drei /
 * postprocessing graph lives in the Stage chunk, NOT the page bundle. This is
 * the same boundary the production swap (S4) will use from build-session.
 */
import dynamic from "next/dynamic";

const DevStage = dynamic(() => import("@/components/stage/dev-stage"), {
  ssr: false,
  loading: () => (
    <div className="p-6 text-sm text-slate-500">loading 3D engine…</div>
  ),
});

export default function DevStagePage() {
  return <DevStage />;
}

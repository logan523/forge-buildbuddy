"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodePlanShare } from "@/lib/share";
import { savePlan, newPlanId, touchPlan } from "@/lib/storage";
import { applyTrustPipeline } from "@/lib/trust";

export default function ImportBuildPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    if (!hash) {
      setError("No share payload in the link.");
      return;
    }
    const decoded = decodePlanShare(hash);
    if (!decoded) {
      setError("Could not read this share link.");
      return;
    }
    const plan = applyTrustPipeline({
      ...decoded,
      id: decoded.id || newPlanId("shared"),
      generatedAt: decoded.generatedAt || new Date().toISOString(),
    });
    // New local id so import doesn't overwrite an existing build with same id
    plan.id = newPlanId("shared");
    savePlan(plan);
    touchPlan(plan.id);
    router.replace(`/build/${plan.id}`);
  }, [router]);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold font-serif text-text mb-2">Import failed</h1>
          <p className="text-sm text-text-secondary mb-4">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold cursor-pointer"
          >
            Go home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        <p className="text-sm text-text-secondary">Importing shared build…</p>
      </div>
    </div>
  );
}

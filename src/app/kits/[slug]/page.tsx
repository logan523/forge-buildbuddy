"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getKit, recordClone, recordView } from "@/lib/kits/store";
import type { KitListing } from "@/lib/kits/types";
import { applyTrustPipeline } from "@/lib/trust";
import { savePlan, newPlanId, touchPlan } from "@/lib/storage";
import { formatUsdRange, estimateBom } from "@/lib/cart";

export default function KitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [kit, setKit] = useState<KitListing | null>(null);

  useEffect(() => {
    if (!slug) return;
    const k = getKit(slug);
    setKit(k);
    if (k) recordView(slug);
  }, [slug]);

  if (!kit) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-text-secondary mb-4">Kit not found.</p>
        <Link href="/kits" className="text-accent text-sm">← All kits</Link>
      </div>
    );
  }

  const bom = estimateBom(kit.plan.parts || [], "split");

  const clone = () => {
    const plan = applyTrustPipeline({
      ...kit.plan,
      id: newPlanId("kit"),
      generatedAt: new Date().toISOString(),
    });
    savePlan(plan);
    touchPlan(plan.id);
    recordClone(slug);
    router.push(`/build/${plan.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/kits" className="text-xs text-text-muted hover:text-text no-underline">← Kits</Link>
      <div className="mt-4 flex items-start gap-4">
        <span className="text-5xl">{kit.coverEmoji}</span>
        <div className="flex-1">
          <h1 className="text-3xl font-bold font-serif text-text mb-2">{kit.title}</h1>
          <p className="text-sm text-text-secondary mb-3">{kit.description}</p>
          <div className="flex flex-wrap gap-3 text-xs text-text-muted mb-4">
            <span>{kit.difficulty}</span>
            <span>·</span>
            <span>{kit.estimatedTime}</span>
            <span>·</span>
            <span className="text-accent font-medium">{kit.estimatedCost}</span>
            <span>·</span>
            <span>{kit.partCount} parts</span>
            {bom.pricedCount > 0 && (
              <>
                <span>·</span>
                <span>cart {formatUsdRange(bom.totalMin, bom.totalMax)}</span>
              </>
            )}
          </div>
          <p className="text-xs text-text-muted mb-6">Published by {kit.authorName}</p>
          <button
            onClick={clone}
            className="px-6 py-3 rounded-xl bg-accent text-white font-semibold text-sm cursor-pointer hover:bg-accent-soft btn-spring"
          >
            Clone to my builds →
          </button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text mb-3">BOM</h2>
        <div className="space-y-2">
          {(kit.plan.parts || []).map((p) => (
            <div
              key={p.id}
              className="flex justify-between gap-3 p-3 rounded-lg border border-border-subtle bg-surface text-sm"
            >
              <div>
                <span className="font-medium text-text">{p.name}</span>
                <span className="text-text-muted text-xs block">{p.specification}</span>
              </div>
              <span className="text-accent font-mono text-xs">×{p.quantity}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-secondary">
        Free kit recipe — no checkout. Clone the plan, use Buy All / Code / PCB / Case inside the build session.
      </div>
    </div>
  );
}

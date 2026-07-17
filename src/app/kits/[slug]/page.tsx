"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getKit, recordClone, recordView } from "@/lib/kits/store";
import type { KitListing } from "@/lib/kits/types";
import { applyTrustPipeline } from "@/lib/trust";
import { savePlan, newPlanId, touchPlan } from "@/lib/storage";
import { formatUsdRange, estimateBom } from "@/lib/cart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon, type IconProps } from "@/components/ui/icon";

// Same theme guess as /kits (title + tags) — duplicated locally rather than
// imported cross-page, since these two route files must stay self-contained.
function kitIcon(kit: Pick<KitListing, "title" | "tags">): { name: IconProps["name"]; label: string } {
  const t = `${kit.title} ${kit.tags.join(" ")}`.toLowerCase();
  if (t.includes("solar") || t.includes("sun")) return { name: "sun", label: "Solar project" };
  if (t.includes("weather") || t.includes("temp") || t.includes("humid") || t.includes("sensor")) {
    return { name: "thermometer", label: "Sensor project" };
  }
  if (t.includes("clock") || t.includes("oled") || t.includes("display") || t.includes("lcd") || t.includes("screen")) {
    return { name: "monitor", label: "Display project" };
  }
  if (t.includes("battery") || t.includes("power") || t.includes("charg")) return { name: "battery", label: "Battery project" };
  if (t.includes("touch") || t.includes("switch") || t.includes("button")) return { name: "hand", label: "Touch project" };
  if (t.includes("esp32") || t.includes("arduino") || t.includes("pico") || t.includes("mcu")) {
    return { name: "cpu", label: "Microcontroller project" };
  }
  return { name: "wrench", label: "DIY project" };
}

export default function KitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const [kit, setKit] = useState<KitListing | null>(null);

  useEffect(() => {
    if (!slug) return;
    const k = getKit(slug);
    // getKit() is SSR-safe (localStorage read is guarded) and the first
    // client render still matches the server's seed-only output — no
    // hydration mismatch, just a browser-only read the rule can't see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  const icon = kitIcon(kit);

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
        <Icon name={icon.name} label={icon.label} size={40} className="text-accent shrink-0" />
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
          <Button variant="primary" size="lg" onClick={clone}>
            Clone to my builds →
          </Button>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text mb-3">BOM</h2>
        <div className="space-y-2">
          {(kit.plan.parts || []).map((p) => (
            <Card key={p.id} padded={false} className="flex justify-between gap-3 p-3 text-sm">
              <div>
                <span className="font-medium text-text">{p.name}</span>
                <span className="text-text-muted text-xs block">{p.specification}</span>
              </div>
              <span className="text-accent font-mono text-xs">×{p.quantity}</span>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-surface-overlay border border-border-subtle text-xs text-text-secondary">
        Free kit recipe — no checkout. Clone the plan, use Buy All / Code / PCB / Case inside the build session.
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listKits } from "@/lib/kits/store";
import type { KitListing } from "@/lib/kits/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconProps } from "@/components/ui/icon";

// A kit's cover icon reads as the project's theme (title + tags), not "the
// first component it happens to contain" — that's build-ui.tsx's partIcon,
// a different heuristic for a different job. No coverEmoji fallback anymore;
// every kit gets a deliberate, aria-labeled icon instead of an arbitrary emoji.
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

export default function KitsPage() {
  const [kits, setKits] = useState<KitListing[]>([]);

  useEffect(() => {
    // listKits() is SSR-safe (localStorage read is guarded) and the first
    // client render still matches the server's kits-only-from-seed output —
    // no hydration mismatch, just a browser-only read the rule can't see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKits(listKits());
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold font-serif text-text mb-2">Kit marketplace</h1>
        <p className="text-text-secondary text-sm max-w-xl">
          Publish a build as a DIY kit recipe — BOM, steps, firmware, and PCB/case exports.
          No payments yet: clone a kit to your browser and buy parts yourself.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kits.map((k) => {
          const icon = kitIcon(k);
          return (
            <Link key={k.slug} href={`/kits/${k.slug}`} className="no-underline block">
              <Card elevated padded={false} className="p-5 hover:border-accent/40 transition-all">
                <Icon name={icon.name} label={icon.label} size={28} className="text-accent mb-3" />
                <h2 className="text-base font-semibold text-text font-serif mb-1">{k.title}</h2>
                <p className="text-xs text-text-secondary line-clamp-2 mb-3">{k.description}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {k.tags.slice(0, 4).map((t) => (
                    <Badge key={t} tone="neutral" size="sm">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>{k.partCount} parts · {k.estimatedCost}</span>
                  <span>{k.stats?.clones || 0} clones</span>
                </div>
                <p className="text-[10px] text-text-muted mt-2">by {k.authorName}</p>
              </Card>
            </Link>
          );
        })}
      </div>

      {kits.length === 0 && (
        <p className="text-sm text-text-muted">No kits yet. Finish a build and hit Publish.</p>
      )}
    </div>
  );
}

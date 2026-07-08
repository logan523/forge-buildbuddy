"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listKits } from "@/lib/kits/store";
import type { KitListing } from "@/lib/kits/types";

export default function KitsPage() {
  const [kits, setKits] = useState<KitListing[]>([]);

  useEffect(() => {
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
        {kits.map((k) => (
          <Link
            key={k.slug}
            href={`/kits/${k.slug}`}
            className="rounded-xl border border-border-subtle bg-surface shadow-card p-5 no-underline hover:border-accent/40 transition-all block"
          >
            <div className="text-3xl mb-3">{k.coverEmoji}</div>
            <h2 className="text-base font-semibold text-text font-serif mb-1">{k.title}</h2>
            <p className="text-xs text-text-secondary line-clamp-2 mb-3">{k.description}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {k.tags.slice(0, 4).map((t) => (
                <span key={t} className="text-[10px] px-2 py-0.5 rounded bg-surface-overlay text-text-muted">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span>{k.partCount} parts · {k.estimatedCost}</span>
              <span>{k.stats?.clones || 0} clones</span>
            </div>
            <p className="text-[10px] text-text-muted mt-2">by {k.authorName}</p>
          </Link>
        ))}
      </div>

      {kits.length === 0 && (
        <p className="text-sm text-text-muted">No kits yet. Finish a build and hit Publish.</p>
      )}
    </div>
  );
}

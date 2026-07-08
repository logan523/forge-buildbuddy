import type { BuildPlan } from "@/lib/types";
import type { KitListing } from "./types";
import seed from "@/data/seed-kits.json";

const KEY = "forge-kits";

function browser() {
  return typeof window !== "undefined";
}

function loadLocal(): KitListing[] {
  if (!browser()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as KitListing[];
  } catch {
    return [];
  }
}

function saveLocal(kits: KitListing[]) {
  if (!browser()) return;
  localStorage.setItem(KEY, JSON.stringify(kits));
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "kit"
  );
}

export function listKits(): KitListing[] {
  const local = loadLocal();
  const seeded = seed as KitListing[];
  const bySlug = new Map<string, KitListing>();
  for (const k of seeded) bySlug.set(k.slug, k);
  for (const k of local) bySlug.set(k.slug, k);
  return [...bySlug.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getKit(slug: string): KitListing | null {
  return listKits().find((k) => k.slug === slug) || null;
}

export function publishKit(opts: {
  plan: BuildPlan;
  authorName: string;
  description?: string;
  coverEmoji?: string;
  tags?: string[];
}): KitListing {
  const baseSlug = slugify(opts.plan.title);
  let slug = baseSlug;
  let n = 1;
  while (getKit(slug) && getKit(slug)?.id !== opts.plan.id) {
    slug = `${baseSlug}-${n++}`;
  }

  const kit: KitListing = {
    id: `kit-${Date.now()}`,
    slug,
    title: opts.plan.title,
    description: opts.description || opts.plan.description,
    coverEmoji: opts.coverEmoji || "🔧",
    authorName: opts.authorName || "Anonymous maker",
    tags: opts.tags || [opts.plan.difficulty, "forge"],
    difficulty: opts.plan.difficulty,
    estimatedCost: opts.plan.estimatedCost,
    estimatedTime: opts.plan.estimatedTime,
    partCount: opts.plan.parts?.length || 0,
    publishedAt: new Date().toISOString(),
    sourceUrl: opts.plan.sourceUrl,
    plan: opts.plan,
    stats: { views: 0, clones: 0 },
  };

  const local = loadLocal().filter((k) => k.slug !== slug);
  local.unshift(kit);
  saveLocal(local);
  return kit;
}

export function recordClone(slug: string) {
  const local = loadLocal();
  const i = local.findIndex((k) => k.slug === slug);
  if (i >= 0) {
    local[i] = {
      ...local[i],
      stats: { ...local[i].stats, clones: (local[i].stats?.clones || 0) + 1 },
    };
    saveLocal(local);
  }
}

export function recordView(slug: string) {
  const local = loadLocal();
  const i = local.findIndex((k) => k.slug === slug);
  if (i >= 0) {
    local[i] = {
      ...local[i],
      stats: { ...local[i].stats, views: (local[i].stats?.views || 0) + 1 },
    };
    saveLocal(local);
  }
}

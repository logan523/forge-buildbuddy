import type { BuildPlan } from "@/lib/types";

export interface KitListing {
  id: string;
  slug: string;
  title: string;
  description: string;
  coverEmoji: string;
  authorName: string;
  tags: string[];
  difficulty: string;
  estimatedCost: string;
  estimatedTime: string;
  partCount: number;
  publishedAt: string;
  sourceUrl?: string;
  plan: BuildPlan;
  stats: { views: number; clones: number };
}

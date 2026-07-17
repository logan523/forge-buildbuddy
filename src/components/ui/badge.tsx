"use client";

import type { ReactNode } from "react";

export type BadgeTone = "success" | "info" | "warning" | "danger" | "neutral";
export type BadgeSize = "sm" | "md";

export interface BadgeProps {
  tone?: BadgeTone;
  size?: BadgeSize;
  className?: string;
  children: ReactNode;
}

// The soft/solid semantic pairs already shipping (build-ui.tsx confidenceBadge,
// power-check.tsx, build-drawers.tsx alerts): -soft background + solid text.
const TONE_CLASS: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success border-success/20",
  info: "bg-info-soft text-info border-info/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  neutral: "bg-surface-overlay text-text-muted border-border-subtle",
};

// Badges tier is radius-sm per globals.css radii tiers.
const SIZE_CLASS: Record<BadgeSize, string> = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1",
  md: "text-xs px-2 py-0.5 gap-1.5",
};

export function Badge({ tone = "neutral", size = "md", className = "", children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border font-semibold whitespace-nowrap ${TONE_CLASS[tone]} ${SIZE_CLASS[size]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Catalog-match confidence → badge copy/tone. Mirrors the score thresholds in
 * src/lib/catalog.ts (scoreMatch) but with beginner-facing copy: never claim
 * "verified" — we know which part, we never tested it works.
 */
export function confidenceTier(score: number | null | undefined): { label: string; tone: BadgeTone } {
  if (typeof score === "number" && score >= 55) return { label: "Catalog match", tone: "success" };
  if (typeof score === "number" && score >= 30) return { label: "Likely match", tone: "info" };
  return { label: "Best guess — check the spec", tone: "warning" };
}

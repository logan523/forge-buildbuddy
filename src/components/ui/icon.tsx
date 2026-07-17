"use client";

// Named imports only — keeps the icon set tree-shakeable.
import {
  Zap,
  BookOpen,
  Microscope,
  Mic,
  Cpu,
  Monitor,
  Sun,
  Battery,
  Thermometer,
  Hand,
  Wrench,
  Drill,
  Hammer,
  Ruler,
  Package,
  ShieldAlert,
  ShoppingCart,
  Code,
  Bug,
  List,
  X,
  Check,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

export const iconMap = {
  zap: Zap,
  "book-open": BookOpen,
  microscope: Microscope,
  mic: Mic,
  cpu: Cpu,
  monitor: Monitor,
  sun: Sun,
  battery: Battery,
  thermometer: Thermometer,
  hand: Hand,
  wrench: Wrench,
  drill: Drill,
  hammer: Hammer,
  ruler: Ruler,
  package: Package,
  "shield-alert": ShieldAlert,
  "shopping-cart": ShoppingCart,
  code: Code,
  bug: Bug,
  list: List,
  x: X,
  check: Check,
  "chevron-down": ChevronDown,
  "external-link": ExternalLink,
} as const;

export interface IconProps {
  name: keyof typeof iconMap;
  size?: number;
  className?: string;
  /** Sets aria-label + role="img"; omit for decorative icons (aria-hidden). */
  label?: string;
}

export function Icon({ name, size = 18, className = "", label }: IconProps) {
  const Glyph = iconMap[name];
  return (
    <Glyph
      size={size}
      className={className}
      aria-label={label}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}

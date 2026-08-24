# Design system — Forge / BuildBuddy

> **PARTLY STALE (2026-08-24).** Title still reads "Forge / BuildBuddy"; the name is Forge.
> Token and primitive guidance still applies; any component inventory does not — the rebuild
> replaced `src/components/build/` entirely with `src/components/bench/`.


Generated from live tokens in `src/app/globals.css` and product principles in `PRODUCT.md`.
Register: **product** (workshop tool UI). Color strategy: **Restrained** (tinted neutrals + one accent).

## Scene

Weekend makers and students at a lit workbench, phone or laptop nearby, iron in hand.
Light ambient room light, cream paper surfaces, cyan accent like a blueprint marker.
Not a dark IDE; not a STEM-toy rainbow.

## Color (OKLCH-aligned hex; AA verified)

| Token | Hex | Role | White text AA |
|-------|-----|------|---------------|
| `bg` | `#f5f0e8` | Page / workshop paper | — |
| `surface` | `#ffffff` | Cards, panels | — |
| `surface-raised` | `#fafaf8` | Elevated media wells | — |
| `surface-overlay` | `#f0ede6` | Nested chips, headers | — |
| `surface-hover` | `#ebe7df` | Row hover | — |
| `border-subtle` | `#e5e0d8` | Dividers | — |
| `border` | `#d4cfc5` | Controls | — |
| `border-strong` | `#b8b2a6` | Emphasis outlines | — |
| `text` | `#1a2744` | Body | on cream: pass |
| `text-secondary` | `#4a5568` | Supporting | on cream: pass |
| `text-muted` | `#5c6b7a` | Meta / chrome | on cream ≥4.5:1 |
| `accent` | `#0e7490` | Primary actions, selection | white on accent ≥4.5:1 |
| `accent-soft` | `#155e75` | Pressed/hover solid | white on fill pass |
| `success` | `#0f766e` | Done / pass | white on fill pass |
| `success-soft` | `#ccfbf1` | Success wash | — |
| `warning` | `#b45309` | Caution | white on fill pass |
| `warning-soft` | `#fef3c7` | Warning wash | — |
| `danger` | `#c53030` | Blocking errors | white on fill pass |
| `danger-soft` | `#fed7d7` | Danger wash | — |
| `info` | `#0e7490` | Same family as accent | pass |
| `info-soft` | `#cffafe` | Info wash | — |

Wire jumper colors (red/black/blue/yellow/green) are **data**, not text color.
Always show them as swatches; labels stay `text` / `text-secondary`.

### Console family (focus / dark tools only)

Firmware viewer, hands-free, expanded stage, PCB preview use `--color-console-*`.
Do not invent new near-black hex outside this set.

## Typography

- **Sans:** Geist / system UI (`--font-sans`)
- **Mono:** Geist Mono for pin names, wire indices, net ids
- **Serif:** Georgia for step titles only (`font-serif`)
- Floor for meaning-bearing UI: **12px** (`text-xs`); expert disclosure may use `text-2xs` (11px)
- Hierarchy: title `text-base`–`text-lg` bold → body `text-sm` → meta `text-xs` muted

## Spacing & radius

- Touch floor: **44×44px** (`min-h-11 min-w-11`)
- Radii: `sm` chips · `md` controls · `lg`–`xl` cards · `2xl` large panels
- Motion: 150ms `ease-out-quart`; respect `prefers-reduced-motion`

## Elevation

- Cards: `--shadow-card`
- Raised: `--shadow-raised`
- Console: border + `--shadow-console` (no glow)

## Components — patterns

### Primary button
`bg-accent text-white min-h-11 rounded-xl font-bold`. Hover → `bg-accent-soft`.

### Selection (lists)
Full wash `bg-accent/10` + inset `ring-1 ring-accent`. **Never** thick left/right side stripes.

### Callouts
Soft tinted box + 1px full border (`border-warning/25 bg-warning-soft`). No side stripe.

### Solder workbench
1. Action strip (color swatch + pin pair + done)
2. Pad map SVG (primary)
3. Wire list (desktop sidebar / mobile chip strip + expandable list)
Done control is a **sibling** of the select control, never nested.

## Absolute bans (project)

- Side-stripe borders (`border-l-*` / `border-r-*` > 1px as accent)
- Gradient text
- Glassmorphism decoration
- Wire hex as text color
- Pure `#000` / `#fff` for large brand surfaces (prefer tinted tokens; SVG diagrams may use near-black for pad graphics)

## Accessibility

- Focus: global `*:focus-visible` 2px accent outline
- Contrast: AA for body and solid fills with white labels
- Live regions for wire-step changes in the workbench
- Color never sole status indicator (pair with text: Done, icons, rings)

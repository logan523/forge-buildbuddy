# Step media (action diagrams)

## Why

The full product silhouette answers “what am I building?”  
**Each step** needs “what do I do with my hands?” — IKEA / GitBuilding pattern.

## Primary vs secondary

| Pane | Content |
|------|---------|
| **Primary** | `resolveStepMedia(step)` → instructional SVG (`oled_desolder`, `i2c_wiring`, …) |
| **Secondary** | Compact 3D product layers (`showLayerPanel={false}`, `compact`) |
| **Optional** | Layout editor: drag **real SVG shapes** (`ProductLayoutEditor`) |

### HTML inject rules

- SVG is a **fragment** only (no `<?xml` prolog)
- Use `viewBox` + `width="100%"` + `height="auto"` (never `height="100%"` alone — collapses under `minHeight` parents)
- `normalizeSvgForHtml()` enforces this at resolve time
- Focus layer from the **same `step` object** as the diagram (never filtered `plan.steps[i]`)

## Layout drag (v2)

Previous approach (HTML labels over string SVG) **failed** (coordinate mismatch).  
Current: React SVG `<g>` nodes with `getScreenCTM()` pointer mapping.

## Kinds

See `src/lib/step-media/types.ts`. Infer from title/description if `step.mediaKind` omitted.

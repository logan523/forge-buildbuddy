# Step media (action diagrams)

## Why

The full product silhouette answers “what am I building?”  
**Each step** needs “what do I do with my hands?” — IKEA / GitBuilding pattern.

## Primary vs secondary

| Pane | Content |
|------|---------|
| **Primary** | `resolveStepMedia(step)` → instructional SVG (`oled_desolder`, `i2c_wiring`, …) |
| **Secondary** | Collapsed product locator (full form) |
| **Optional** | Layout editor: drag **real SVG shapes** (`ProductLayoutEditor`) |

## Layout drag (v2)

Previous approach (HTML labels over string SVG) **failed** (coordinate mismatch).  
Current: React SVG `<g>` nodes with `getScreenCTM()` pointer mapping.

## Kinds

See `src/lib/step-media/types.ts`. Infer from title/description if `step.mediaKind` omitted.

# Product Visual System

## Goal

Every build shows a **physical product form** (what sits on the desk), not a BOM block diagram.

- **Reference demos** (Sat Line): golden high-grade `FormSpec`  
- **Description-only / LLM plans**: template match + L5 `formSpec`  

## Authority

```
BuildPlan.parts / title
        │
        ▼
  resolveFormSpec()
    1. plan.formSpec (validated)
    2. demo golden (plan.id)
    3. template_match(BOM)
        │
        ▼
  template render(FormSpec, AssemblyStage) → SVG
        │
        ▼
  ProductHero / StepVisual
```

## FormSpec

```ts
templateId: sat_clock | weather_stick | robot_chassis | sensor_pod | boxed_gadget | breadboard
params, materials, layers, productCaption, source, grade
```

| Grade | Meaning |
|-------|---------|
| high | Demo golden or strong match |
| medium | Reasonable template match |
| assumed | Weak match / LLM soft parse |

## Templates

| ID | Physical form |
|----|----------------|
| sat_clock | Bamboo disc, brass frame, OLED face, solar wings, power bay |
| weather_stick | Mast + sensor head |
| robot_chassis | Body + wheels + MCU |
| sensor_pod | Compact shell |
| boxed_gadget | Enclosure + optional display window |
| breadboard | Honest prototype board |

## Files

- `formspec/` — types, schema, match, resolve, layers  
- `templates/` — SVG renderers  
- `palette.ts` — shared materials  
- `__golden__/sat-line-formspec.json`  

## Layout edit (drag)

`FormSpec.layout` stores per-layer `{ x, y }` offsets.  
UI: **Move parts** on the product canvas (presets: button top/left/right).  
SVG groups apply `translate` on top of template anchors.

## Beginner steps

Prefer `goal` / `youNeed` / `actions` / `doneWhen` on each `BuildStep`.  
`InstructionCard` shows checklist UX; long `description` collapses under Full notes.

## Non-goals

- Photoreal AI / video frames  
- Perfect CAD dimensions  
- Replacing PCB / OpenSCAD  
- Full tldraw/Excalidraw whiteboard  


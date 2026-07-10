# Bench photos (progressive — optional, drop in when shot)

Real photos enrich the guided build. Both are **probed and only shown when the
file decodes** (`useProbedImage`), so a missing file never flashes a ghost card —
the 3D model stays the answer until a photo exists. No code change needed to add one.

## Per-step bench photo

```
public/build-photos/<planId>/step-<stepNumber>.jpg
```

Shown in the step hero ("Your bench · step N"), click to zoom. `<stepNumber>` is
the step's `stepNumber`, not its index.

## Per-part identity photo (P3)

```
public/build-photos/<planId>/part-<catalogId>.jpg
```

Shown at the top of a part's identity card ("What am I connecting?"), so a
beginner can match the real thing in their hand. `<catalogId>` is the part's
catalog id — the sat-clock demo ids are:

`esp32_c3`, `oled_096`, `tp4056`, `cell_16340`, `sht30`, `ttp223`,
`solar_cell`, `generic_pcb`.

Example: `public/build-photos/sat-line/part-esp32_c3.jpg`.

Landscape framing, ~2:1, on a plain background reads best (card slot is short + wide).

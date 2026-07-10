# E3 photo-check eval fixtures

The "Did I do it right?" button ships OFF. It turns on only when this eval
passes, and turns back off the moment it fails — `scripts/eval-photo-check.mjs`
writes or deletes `public/photo-check.pass.json`, and the button probes that
file at runtime. There is no other switch.

## What to photograph (founder bench time)

From your own Sat Line build, at the wiring steps that have reference photos:

- **≥ 20 photos total**
- **≥ 8 deliberately miswired** — build the mistake, photograph it, undo it:
  - SDA and SCL swapped at the display
  - SDA and SCL swapped at the sensor
  - GND wire missing entirely
  - power wire on the wrong rail (5V pin instead of 3V3)
  - one wire unseated / hanging
  - wire on an adjacent wrong pin
  - two different mistakes in one photo
  - a subtle one: right pins, wrong color order (tests color grounding)
- **≥ 2 devices or lighting setups** (e.g. phone + laptop webcam, or daylight + desk lamp) — set the `device` field accordingly
- Correct-build photos should span angles: straight-on, oblique, close-up, one slightly blurry (the checker should abstain on that one, not pass it)

## manifest.json format

```json
{
  "facts": {
    "stepTitle": "Wire the OLED display and SHT31 sensor",
    "connections": [
      { "colorName": "blue",   "fromLabel": "ESP32-C3", "fromPin": "GPIO4", "toLabel": "OLED Display", "toPin": "SDA" },
      { "colorName": "yellow", "fromLabel": "ESP32-C3", "fromPin": "GPIO5", "toLabel": "OLED Display", "toPin": "SCL" },
      { "colorName": "red",    "fromLabel": "ESP32-C3", "fromPin": "3V3",   "toLabel": "OLED Display", "toPin": "VCC" },
      { "colorName": "black",  "fromLabel": "ESP32-C3", "fromPin": "GND",   "toLabel": "OLED Display", "toPin": "GND" }
    ],
    "checks": []
  },
  "fixtures": [
    { "file": "correct-01.jpg",  "label": "correct",  "device": "iphone",  "note": "straight-on, daylight" },
    { "file": "miswired-01.jpg", "label": "miswired", "device": "iphone",  "note": "SDA/SCL swapped at display",
      "reference": "correct-01.jpg" }
  ]
}
```

- `facts` at the top level is the default; a fixture can override with its own `facts`.
- `reference` (optional) sends a known-good photo alongside, like the real UI does.
- `label` must be `"correct"` or `"miswired"`. `note` should say WHICH mistake.

## Run it

```bash
npx tsx scripts/eval-photo-check.mjs
```

**Pass bar: zero miswired photos judged "looks_right".** An abstain
("can't tell") on a miswired photo is fine — a false pass is the one
unacceptable outcome. The script also warns (without failing) if the checker
abstains on more than half the correct photos, since an always-abstaining
checker isn't worth its button.

## Kill criteria (founder-approved, docs/designs/step-instruction-overhaul.md)

- Eval fails after one fixture-set revision → feature stays OFF.
- ONE confirmed false-"looks_right" from the field → `rm public/photo-check.pass.json`, feature OFF. No debate.

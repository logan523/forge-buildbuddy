# Part Scan Vision — camera → your exact modules → solder guidance

## Job

Builder holds their real modules under a phone/webcam. Forge identifies which
plan part each photo is, stores a **bench inventory** of *their* items, and
uses those photos + catalog pin truth when teaching where to solder.

## Open-source landscape (research)

**Full scored evaluation:** [AR-VENDOR-EVAL.md](./AR-VENDOR-EVAL.md) (2026-07-28).

| Project | What it does | What we take |
|---------|--------------|--------------|
| **[SanderGi/PCB-Detection](https://github.com/SanderGi/PCB-Detection)** | YOLOv11 OBB find-PCB, MIT, ~2.6 MB | **Primary next adapter** for board lock |
| [Image2schematic](https://github.com/s39674/Image2schematic) + [PCB-CD](https://github.com/s39674/PCB-Component-Detection) | Python CV + NN reverse-schematic | Ideas only (not browser) |
| Defect/AOI YOLO repos | Solder defects | Later photo-check, not pad AR |
| [LightGlue-ONNX](https://github.com/fabio-sim/LightGlue-ONNX) | Feature match | Phase B: scan photo ↔ live frame |
| ARDW (ACM UIST) | Lab projection AR | UX north star |
| [InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) | BOM ↔ footprint | Wire list + highlight UX |
| AR.js | Marker AR | Skipped for free-form modules |

**Design choice:** Kit BOM identity stays **VLM + candidates**. Board *localization*
should upgrade to **SanderGi OBB** (or equal), not open-world component YOLO.

## Architecture

```
Camera (getUserMedia)
    → capture JPEG frame
    → POST /api/part-scan { image, candidates[] from plan.parts }
    → Vision: pick candidate id OR unknown + cues
    → BenchInventory (localStorage per planId)
    → SolderWorkbench: for wire involving partId,
         show YOUR photo + pad map + orientation tips for that catalog face
```

### Phases

1. **Shipped**  
   Camera capture, constrained match, inventory, workbench injects scan photo
   + manipulate tips when the active wire touches a scanned part.

2. **Shipped**  
   - **Batch all** wizard walks remaining BOM parts one-by-one  
   - Silkscreen / pin OCR fields in vision JSON (`silkscreenText`, `visiblePins`)  
   - Pin-hit confidence boost when visible pins match catalog  
   - **Live camera guide**: fullscreen HUD with exact pad name, board A/B
     toggle, scanned PIP, pad map strip (registration-free ARDW-style)

3. **Shipped (true AR + hybrid track)** — see `docs/AR-TRACKING-SCOPE.md`  
   - Multi-scale contour board region detect (YOLO plugin interface, stub only)  
   - **Lucas–Kanade** sparse optical flow on 4 corners  
   - Hybrid state machine: seeking → tracking → reacquiring  
   - Homography → pin UV → live **SOLDER** marker  
   - 4-corner calibrate + confidence bar + mode diagnostics  
   - **Out of scope until labeled data / model budget:** custom YOLO weights

## Fail-closed rules

- Never invent a part not in the candidate list.
- Prefer `unknown` / low confidence over wrong high confidence.
- Offline / no API key → manual pick from BOM still works (photo optional).

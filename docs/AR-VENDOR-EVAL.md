# AR / vision vendor evaluation (GitHub)

**Date:** 2026-07-28  
**Purpose:** Compare external open-source work to Forge’s one-shot AR stack, and pick what to adopt next.  
**Product interface:** `BoardRegionDetector` in `src/lib/part-scan/detectors.ts` + hybrid LK tracker.

---

## TL;DR

| Rank | Project | Use for | Verdict |
|------|---------|---------|---------|
| **1** | [SanderGi/PCB-Detection](https://github.com/SanderGi/PCB-Detection) | **Find the board** in a messy photo (OBB, 2.6 MB) | **Primary pull** — best fit for AR lock |
| **2** | [openscopeproject/InteractiveHtmlBom](https://github.com/openscopeproject/InteractiveHtmlBom) | Pad/BOM correlation patterns | **Already borrowed** conceptually; keep as UX authority |
| **3** | [s39674/Image2schematic](https://github.com/s39674/Image2schematic) + [PCB-CD](https://github.com/s39674/PCB-Component-Detection) | Component class + OCR pipeline (Python) | **Ideas only** — not browser-ready |
| **4** | [aryan-programmer/pcb-fault-detection](https://github.com/aryan-programmer/pcb-fault-detection) | Defect AOI + ONNX export path | **Wrong job** (defects ≠ pad guide) |
| **5** | [fabio-sim/LightGlue-ONNX](https://github.com/fabio-sim/LightGlue-ONNX) | Feature match scan photo ↔ live frame | **Phase B** after board lock is solid |
| **6** | ARDW (ACM UIST / Arduino blog) | Projection AR with design files | **North star UX**; needs KiCad + projector/camera rig |

**Forge today** is a thin product slice: contour board find + LK + homography + BOM-constrained VLM part ID. The GitHub systems above are **months of dataset + training work**. We should **plug their weights into our interface**, not retrain from scratch.

---

## What we built (baseline)

| Layer | Implementation | Strength | Weakness vs mature repos |
|-------|----------------|----------|---------------------------|
| Part identity | Anthropic vision, BOM candidates | Kit-safe, fail-closed | Needs API key; not offline |
| Board region | Pure-TS edges/contours | Zero deps, instant | Fails in clutter/glare |
| Track | Lucas–Kanade 4 corners | Survives small motion | Loses lock when detect is wrong |
| Pad place | Catalog UV → homography | Correct *if* board lock is good | UV is catalog ideal, not your clone’s silk |
| UX | Wire list, batch scan, live HUD | Product-shaped | No dataset, no trained detector |

---

## Detailed evaluations

### 1. SanderGi/PCB-Detection — **Adopt**

- **URL:** https://github.com/SanderGi/PCB-Detection  
- **License:** MIT  
- **Job:** Detect *where the PCB is* in a photo (not individual resistors).  
- **Artifacts:** YOLOv11 OBB weights on Hugging Face (~**2.6 MB** OBB; ~6.4 MB seg).  
- **Claims:** OBB **93% mAP50**, robust to lighting, perspective, distractors; multi-PCB.  
- **Stack:** Ultralytics YOLO (Python train/infer).  

**Fit to Forge**

| Criterion | Score | Notes |
|-----------|-------|-------|
| Correct problem | ★★★★★ | Exactly “find board for AR lock” |
| Size budget (&lt;5 MB) | ★★★★★ | OBB 2.6 MB fits scope doc |
| License | ★★★★★ | MIT |
| Browser today | ★★☆☆☆ | Needs export ONNX/TFLite + ort-web or server worker |
| Bench modules (not full PCBs) | ★★★★☆ | Trained on PCBs; SuperMini/OLED should still box well with padding tip |

**Integration path (recommended next engineering sprint)**

1. Offline export: `best.pt` → ONNX (or use Ultralytics export).  
2. Lazy-load `onnxruntime-web` only when user opens Live AR (not on homepage).  
3. Implement `SanderGiObbDetector implements BoardRegionDetector`:  
   - input: work canvas ImageData  
   - output: oriented box → 4 corners → existing `orderCorners` + hybrid tracker.  
4. Keep contour detector as fallback if model fails to load.  

**Do not:** check 13 GB training data into the monorepo.

---

### 2. InteractiveHtmlBom — **Already product-pattern**

- **URL:** https://github.com/openscopeproject/InteractiveHtmlBom  
- **License:** MIT  
- **Job:** HTML BOM + footprint highlight for hand assembly.  

**What they have that we don’t:** real KiCad footprint geometry, search, side filters.  
**What we have that they don’t:** live camera, guided one-wire UX, kit BOM from video.

**Action:** Stay pattern-aligned (list + highlight). Full IBOM only if we ingest KiCad from PCB export (separate project).

---

### 3. Image2schematic + PCB-CD — **Research / offline tools**

- **URLs:**  
  - https://github.com/s39674/Image2schematic  
  - https://github.com/s39674/PCB-Component-Detection  
- **Stack:** OpenCV + EasyOCR + skidl; Python; experimental.  
- **Job:** Reverse-engineer schematics from board photos.

**Extensive vs us:** Full pipeline (preprocess → classify → OCR → nets → skidl).  
**Not adoptable as-is:** Desktop Python, heavy OCR, not real-time browser AR.

**Action:** Steal **ideas** only (OCR silkscreen, confidence, multi-stage). We already partially did OCR fields on part-scan. Do **not** vendor the repo.

---

### 4. aryan-programmer/pcb-fault-detection (+ Flutter UI with ORT) — **Pass for AR**

- **URL:** https://github.com/aryan-programmer/pcb-fault-detection  
- **Job:** Defect / AOI classification (solder bridges, missing parts, etc.).  
- **Has:** ONNX export path, edge ORT in a Flutter desktop app.

**Useful for:** post-solder “does this joint look bad?” later.  
**Not useful for:** finding pad *before* solder for first-time builders.

---

### 5. LightGlue-ONNX — **Phase B (align scan ↔ live)**

- **URL:** https://github.com/fabio-sim/LightGlue-ONNX  
- **Job:** Fast local feature matching; ONNX + optional WebGPU demo.  

**Fit:** Match builder’s **bench scan photo** of a module to the **live frame** for better registration than “assume catalog UV.”  
**Cost:** Second model + feature extractors; more complex than OBB.  
**Action:** Only after SanderGi board lock is in production.

---

### 6. ARDW (research system)

- **Refs:** ACM UIST paper; [Arduino blog summary](https://blog.arduino.cc/2022/11/09/computer-vision-and-project-mapping-enable-ar-pcb-debugging-bliss/)  
- **Job:** Track known PCB + project traces/debug overlays (often with design files).  

**Extensive:** Full lab system (camera, calibration, design data).  
**Forge gap:** We don’t require projector or KiCad for every YouTube kit.  
**Action:** Keep as **UX north star** (“see through to the pad”), not as a dependency.

---

### 7. Roboflow “printed circuit board” / component models

- **Example:** [Roboflow 100 PCB dataset/models](https://universe.roboflow.com/roboflow-100/printed-circuit-board)  
- **Job:** Often *components on* a PCB, not “where is the board.”  

**Action:** Useful if we later do per-footprint detection. Secondary to SanderGi OBB for AR.

---

### 8. Document-scanner / jscanify-class libs

- **Job:** Generic rectangle warp (paper).  
- **vs PCB:** We already reimplemented a lighter version of this for board quads.  

**Action:** Only if contour quality is still weak after OBB; don’t add a second scanner stack now.

---

## Gap analysis: extensive repos vs Forge one-shot

| Capability | Mature OSS | Forge now | Priority |
|------------|------------|-----------|----------|
| Find PCB in clutter | SanderGi YOLO OBB | Contour heuristic | **P0 adopt** |
| Track motion | OpenCV KLT / Deep trackers | Pure LK 4 pts | OK short-term |
| Component class | PCB-CD, Roboflow | VLM + BOM list | OK for kits |
| Silkscreen OCR | EasyOCR (heavy) | VLM text fields | OK |
| Footprint truth | KiCad + IBOM | Catalog UV | P1 later |
| Defect after solder | AOI YOLO repos | Photo-check | P2 |
| Live pin on pixels | ARDW / custom | Homography | OK if lock good |

**Conclusion:** The biggest gap is **board localization quality**, not pad math. SanderGi closes that gap with a **2.6 MB MIT model** and a clean adapter into code we already have.

---

## Recommended adoption plan

### Sprint A (recommended next) — SanderGi OBB adapter

1. Export / host `best.pt` → ONNX (or document user-download URL + integrity hash).  
2. `npm` optional peer: `onnxruntime-web` (lazy dynamic import).  
3. `SanderGiObbDetector` → `setBoardDetector(...)` when Live AR opens.  
4. Feature flag: `NEXT_PUBLIC_AR_DETECTOR=contour|sander gi|auto`.  
5. Fallback chain: ONNX fail → contour → calibrate.  
6. Bench test: sat-line modules on messy desk; measure lock time & lost-lock rate.

**Estimate:** 2–4 eng days including mobile perf pass.  
**Risk:** OBB is rotated box, not perfect perspective quad; may still need corner refine (we already have LK + calibrate).

### Sprint B — Scan↔live registration (optional)

LightGlue or ORB match between bench inventory photo and live crop of locked board → refine pin UV.

### Sprint C — Do not start until A ships

Custom training, IBOM/KiCad full import, AOI defect YOLO.

---

## Comparison table (honest)

| | Forge hybrid (now) | SanderGi + our AR | Full Image2schematic | ARDW lab |
|--|--------------------|-------------------|----------------------|----------|
| Time to first pad guide | Shipped | +1 sprint | Months Python | Research lab |
| Works offline | Detect/track yes; part ID needs API | Detect yes | Mostly yes | Yes |
| Bundle impact | ~0 model MB | +~3–8 MB | N/A (desktop) | N/A |
| Clutter robustness | Weak | Strong | Medium | Strong w/ setup |
| Kit DIY modules | Good enough UX | Better lock | Aimed at reverse eng | Aimed at known boards |

---

## Decision log

| Decision | Choice | Why |
|----------|--------|-----|
| Primary external model | **SanderGi PCB-OBB** | MIT, small, right task |
| Ship weights in git? | **No** — CDN/HF + hash | Repo size, updateability |
| Replace LK? | **No** for now | Works once box is good |
| Vendor Image2schematic | **No** | Wrong runtime |
| Wire ONNX this session | **No** without size/perf spike | Evaluation first per user ask |

---

## Wired (2026-07-29)

Sprint A implemented:

| Piece | Path |
|-------|------|
| ONNX weights | `public/models/ar/sander-gi-pcb-obb.onnx` (~10 MB export) |
| Export script | `npm run ar:export-sander-gi` → `scripts/export-sander-gi-obb.mjs` |
| Runtime decoder | `src/lib/part-scan/sander-gi-obb.ts` (ort-web, letterbox, xywhr→quad) |
| Cascade | `CascadedBoardDetector(SanderGi sync façade, ContourBoardDetector)` |
| Live AR | Preloads model; async detect every ~6 frames; contour always fallback |

**Not** in git LFS policy change — binary lives under `public/models/ar/`. Re-export after weight updates.

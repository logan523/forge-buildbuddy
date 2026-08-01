# AR board tracking — scope

## Goal

Keep the solder-pad highlight glued to the **real module in the live camera**
through small motion, hand shake, and moderate clutter — without shipping a
multi‑hundred‑MB training pipeline or a YOLO model we cannot guarantee on
every kit photo.

## In scope (this build)

| Piece | What | Why |
|-------|------|-----|
| **Hybrid tracker** | State machine: `seek → track → reacquire` | Clear failure modes; never freezes on a dead lock |
| **Sparse optical flow** | Lucas–Kanade on 4 board corners (pure TS) | Industry-standard corner follow between detections |
| **Multi-scale region detect** | Edge/contour quad finder at 2 scales + 2 thresholds | Better “find the PCB” without a neural net |
| **Detector plugin interface** | `BoardRegionDetector` with default pure-JS impl | Drop-in for ONNX/YOLO later without rewriting AR |
| **Manual calibrate** | Existing 4-tap corners | Always works when vision fails |
| **Diagnostics HUD** | Mode, score, flow confidence | Debuggable at the bench |

## Out of scope (explicitly later)

| Piece | Why deferred |
|-------|----------------|
| Custom YOLO training / Roboflow pipeline | Needs labeled dataset per module family; ops cost |
| Shipping large ONNX weights in repo | Bundle size, license, cold-start on mobile |
| Full 6DOF pose (PnP + IMU) | Needs intrinsics + depth; overkill for pad UV |
| Multi-board simultaneous AR | UX and association problem; single-module first |
| Server-side frame vision | Latency + privacy; keep pixels on-device |

## Success criteria

1. After lock, corners survive **≥2 s** of slow hand motion without re-tap.
2. Lost lock auto-**reacquires** when board re-enters frame (or user calibrates).
3. No new npm deps; pure TS, unit-tested math.
4. Live UI shows tracking mode (`seeking` / `tracking` / `calibrating`).

## Architecture

```
Video frame
  → grayscale (downscale)
  → BoardRegionDetector.detect()     // multi-scale contour (default)
       optional future: OnnxYoloDetector
  → HybridTracker.update(frame)
       if tracking: LucasKanade.trackCorners(prevGray, gray, corners)
       if low confidence: reacquire via detect()
  → Homography(UNIT_QUAD → corners)
  → Pin UV → screen → canvas AR
```

## Exit criteria for “YOLO phase”

**Met by vendor pick (see docs/AR-VENDOR-EVAL.md):**

- [SanderGi/PCB-Detection](https://github.com/SanderGi/PCB-Detection) MIT OBB weights ~**2.6 MB**, 93% mAP50 for *PCB in image*
- Still need: ONNX export + `ort-web` lazy load + mobile p95 &lt; 80 ms smoke test

Until that adapter ships, hybrid contour + LK is the product path.
Fallback chain after adapter: **ONNX OBB → contour → 4-corner calibrate**.

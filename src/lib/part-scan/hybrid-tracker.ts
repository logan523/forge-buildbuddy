/**
 * Hybrid board tracker: region detect + Lucas–Kanade corner flow.
 *
 * Coordinate space: **work frame** (the ImageData passed to update — e.g. 200×N).
 * Caller maps work → display only when drawing.
 *
 * States: seeking → tracking → reacquiring → (or calibrating via setManualQuad)
 *
 * See docs/AR-TRACKING-SCOPE.md
 */

import type { Pt } from "./homography";
import { cornerDistance, quadArea } from "./homography";
import { orderCorners } from "./board-detect";
import { getBoardDetector, type BoardRegionDetector } from "./detectors";
import { rgbaToGray, trackPointsLK, type Gray } from "./optical-flow";

export type TrackerState = "seeking" | "tracking" | "reacquiring" | "calibrating";

export interface TrackerSnapshot {
  state: TrackerState;
  /** TL,TR,BR,BL in work-frame pixels */
  quad: Pt[] | null;
  confidence: number;
  method: "flow" | "detect" | "manual" | "none";
  framesInState: number;
}

export interface HybridTrackerOptions {
  flowMinConfidence?: number;
  redetectEvery?: number;
  reacquireBudget?: number;
  detector?: BoardRegionDetector;
}

const DEFAULTS = {
  flowMinConfidence: 0.08,
  redetectEvery: 10,
  reacquireBudget: 24,
};

export class HybridTracker {
  private state: TrackerState = "seeking";
  private quad: Pt[] | null = null;
  private prevGray: Gray | null = null;
  private framesInState = 0;
  private trackFrames = 0;
  private confidence = 0;
  private method: TrackerSnapshot["method"] = "none";
  private readonly detector: BoardRegionDetector;
  private readonly flowMinConfidence: number;
  private readonly redetectEvery: number;
  private readonly reacquireBudget: number;

  constructor(opts: HybridTrackerOptions = {}) {
    this.flowMinConfidence = opts.flowMinConfidence ?? DEFAULTS.flowMinConfidence;
    this.redetectEvery = opts.redetectEvery ?? DEFAULTS.redetectEvery;
    this.reacquireBudget = opts.reacquireBudget ?? DEFAULTS.reacquireBudget;
    this.detector = opts.detector ?? getBoardDetector();
  }

  getSnapshot(): TrackerSnapshot {
    return {
      state: this.state,
      quad: this.quad ? this.quad.map((p) => ({ ...p })) : null,
      confidence: this.confidence,
      method: this.method,
      framesInState: this.framesInState,
    };
  }

  /** Manual lock — corners already in work-frame space, any order. */
  setManualQuad(quad: Pt[]): void {
    this.quad = orderCorners(quad);
    this.state = "calibrating";
    this.framesInState = 0;
    this.confidence = 1;
    this.method = "manual";
    this.prevGray = null;
    this.trackFrames = 0;
  }

  reset(): void {
    this.state = "seeking";
    this.quad = null;
    this.prevGray = null;
    this.framesInState = 0;
    this.trackFrames = 0;
    this.confidence = 0;
    this.method = "none";
  }

  /**
   * @param imageData work-resolution RGBA frame
   * @param fullW/fullH full video size (detector maps work→full→we map back)
   */
  update(imageData: ImageData, fullW: number, fullH: number): TrackerSnapshot {
    this.framesInState += 1;
    const gray = rgbaToGray(imageData);
    const workW = imageData.width;
    const workH = imageData.height;

    const fullToWork = (p: Pt): Pt => ({
      x: (p.x / fullW) * workW,
      y: (p.y / fullH) * workH,
    });

    // --- calibrating: hold manual corners; optional light flow ---
    if (this.state === "calibrating" && this.quad) {
      if (this.prevGray) {
        const flow = trackPointsLK(this.prevGray, gray, this.quad);
        if (flow.meanConfidence >= this.flowMinConfidence * 0.5) {
          const next = orderCorners(flow.points);
          if (quadArea(next) > workW * workH * 0.02) {
            this.quad = next;
            this.confidence = Math.max(0.75, flow.meanConfidence);
            this.method = "manual";
          }
        }
      }
      this.prevGray = gray;
      return this.getSnapshot();
    }

    // --- tracking / reacquiring ---
    if (this.state === "tracking" || this.state === "reacquiring") {
      this.trackFrames += 1;
      let ok = false;

      if (this.prevGray && this.quad) {
        const flow = trackPointsLK(this.prevGray, gray, this.quad);
        if (flow.meanConfidence >= this.flowMinConfidence) {
          const next = orderCorners(flow.points);
          const jump = cornerDistance(this.quad, next);
          const diag = Math.hypot(workW, workH);
          if (jump < diag * 0.1 && quadArea(next) > workW * workH * 0.015) {
            this.quad = next;
            this.confidence = flow.meanConfidence;
            this.method = "flow";
            ok = true;
            if (this.state === "reacquiring") {
              this.state = "tracking";
              this.framesInState = 0;
            }
          }
        }
      }

      const needDetect =
        !ok ||
        this.trackFrames % this.redetectEvery === 0 ||
        this.state === "reacquiring";

      if (needDetect) {
        const det = this.detector.detect(imageData, fullW, fullH);
        if (det && det.score > 0.02) {
          // Detector returns full video coords → work
          const workQuad = orderCorners(det.quad.map(fullToWork));
          if (!this.quad || !ok) {
            this.quad = workQuad;
          } else {
            this.quad = orderCorners(
              this.quad.map((p, i) => ({
                x: p.x * 0.7 + workQuad[i]!.x * 0.3,
                y: p.y * 0.7 + workQuad[i]!.y * 0.3,
              }))
            );
          }
          this.method = ok ? "flow" : "detect";
          this.confidence = Math.max(
            this.confidence,
            Math.min(1, det.score * 2.2)
          );
          this.state = "tracking";
          this.framesInState = 0;
          ok = true;
        }
      }

      if (!ok) {
        if (this.state !== "reacquiring") {
          this.state = "reacquiring";
          this.framesInState = 0;
        }
        if (this.framesInState > this.reacquireBudget) {
          this.state = "seeking";
          this.quad = null;
          this.confidence = 0;
          this.method = "none";
          this.framesInState = 0;
          this.trackFrames = 0;
        } else {
          this.confidence *= 0.88;
        }
      }

      this.prevGray = gray;
      return this.getSnapshot();
    }

    // --- seeking ---
    const det = this.detector.detect(imageData, fullW, fullH);
    if (det && det.score > 0.025) {
      this.quad = orderCorners(det.quad.map(fullToWork));
      this.state = "tracking";
      this.framesInState = 0;
      this.trackFrames = 0;
      this.confidence = Math.min(1, det.score * 2.5);
      this.method = "detect";
    } else {
      this.confidence = 0;
      this.method = "none";
    }
    this.prevGray = gray;
    return this.getSnapshot();
  }
}

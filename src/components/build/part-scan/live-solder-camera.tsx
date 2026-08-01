"use client";

/**
 * Hybrid AR solder guide (scoped — see docs/AR-TRACKING-SCOPE.md):
 *  multi-scale contour detect → Lucas–Kanade corner flow → homography pins
 *  + 4-corner calibrate fallback. No YOLO weights in-repo yet (plugin ready).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicroStep } from "@/lib/types";
import type { BenchItem } from "@/lib/part-scan";
import {
  applyHomography,
  computeHomography,
  UNIT_QUAD,
  type Pt,
} from "@/lib/part-scan/homography";
import { orderCorners } from "@/lib/part-scan/board-detect";
import {
  HybridTracker,
  type TrackerState,
} from "@/lib/part-scan/hybrid-tracker";
import {
  resolvePinUv,
  uvToPt,
  pinLayoutForCatalog,
} from "@/lib/part-scan/pin-layout";
import {
  detectSanderGiObb,
  preloadSanderGiObb,
} from "@/lib/part-scan/sander-gi-obb";
import { getSanderGiSyncFacade } from "@/lib/part-scan/detectors";
import { PinConnectionDiagram } from "../pin-connection-diagram";

type Face = "from" | "to";

const STATE_LABEL: Record<TrackerState, string> = {
  seeking: "Seeking board…",
  tracking: "AR tracking",
  reacquiring: "Reacquiring…",
  calibrating: "Manual + flow",
};

const WORK_W = 220;

export function LiveSolderCamera({
  micro,
  fromItem,
  toItem,
  onClose,
  onMarkDone,
  isDone,
}: {
  micro: MicroStep;
  fromItem?: BenchItem;
  toItem?: BenchItem;
  onClose: () => void;
  onMarkDone: () => void;
  isDone: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workCanvas = useRef<HTMLCanvasElement | null>(null);
  const trackerRef = useRef(new HybridTracker());
  const videoQuadRef = useRef<Pt[] | null>(null);
  const rafRef = useRef(0);
  const frameCount = useRef(0);
  const calibratePts = useRef<Pt[]>([]);
  const calibrateModeRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [face, setFace] = useState<Face>("from");
  const [showMap, setShowMap] = useState(false);
  const [calibrateMode, setCalibrateMode] = useState(false);
  const [diag, setDiag] = useState({
    state: "seeking" as TrackerState,
    confidence: 0,
    method: "none",
  });
  const [status, setStatus] = useState("Point camera at one module");
  const [detectorLabel, setDetectorLabel] = useState("contour");
  const sanderBusy = useRef(false);

  const activeItem = face === "from" ? fromItem : toItem;
  const activeLabel = face === "from" ? micro.fromLabel : micro.toLabel;
  const activePin = face === "from" ? micro.fromPin : micro.toPin;
  const otherPin = face === "from" ? micro.toPin : micro.fromPin;
  const catalogId = activeItem?.catalogId;

  const coverMaps = useCallback(
    (vw: number, vh: number, cssW: number, cssH: number) => {
      const scale = Math.max(cssW / vw, cssH / vh);
      const dispW = vw * scale;
      const dispH = vh * scale;
      const offX = (cssW - dispW) / 2;
      const offY = (cssH - dispH) / 2;
      return {
        videoToCss: (vx: number, vy: number): Pt => ({
          x: offX + vx * scale,
          y: offY + vy * scale,
        }),
        cssToVideo: (cx: number, cy: number): Pt => ({
          x: (cx - offX) / scale,
          y: (cy - offY) / scale,
        }),
      };
    },
    []
  );

  // Camera + lazy SanderGi OBB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Kick model load in parallel with camera (does not block UI)
      void preloadSanderGiObb().then((s) => {
        if (!cancelled && s) setDetectorLabel("sander-gi+contour");
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        setErr("Camera not available.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play();
          setReady(true);
        }
      } catch {
        setErr("Allow camera access for true AR solder guide.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      getSanderGiSyncFacade().setLast(null);
    };
  }, []);

  // Single AR loop
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let lastDiag = "";

    const loop = () => {
      if (!alive) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const stage = stageRef.current;
      if (!video || !canvas || !stage || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = rect.width;
      const cssH = rect.height;
      if (cssW < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const pxW = Math.round(cssW * dpr);
      const pxH = Math.round(cssH * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const maps = coverMaps(vw, vh, cssW, cssH);
      const workH = Math.max(40, Math.round((vh / vw) * WORK_W));

      frameCount.current += 1;
      let snap = trackerRef.current.getSnapshot();

      // Tracker update every other frame; SanderGi OBB every ~6 frames (async)
      if (frameCount.current % 2 === 0) {
        if (!workCanvas.current) workCanvas.current = document.createElement("canvas");
        const wc = workCanvas.current;
        wc.width = WORK_W;
        wc.height = workH;
        const wctx = wc.getContext("2d", { willReadFrequently: true });
        if (wctx) {
          wctx.drawImage(video, 0, 0, WORK_W, workH);
          const img = wctx.getImageData(0, 0, WORK_W, workH);

          // Fire SanderGi without blocking the rAF loop
          if (frameCount.current % 6 === 0 && !sanderBusy.current) {
            sanderBusy.current = true;
            void detectSanderGiObb(img, vw, vh)
              .then((r) => {
                getSanderGiSyncFacade().setLast(r);
                if (r) setDetectorLabel("sander-gi+contour");
              })
              .finally(() => {
                sanderBusy.current = false;
              });
          }

          snap = trackerRef.current.update(img, vw, vh);
          if (snap.quad) {
            const sx = vw / WORK_W;
            const sy = vh / workH;
            videoQuadRef.current = snap.quad.map((p) => ({
              x: p.x * sx,
              y: p.y * sy,
            }));
          } else if (snap.state === "seeking") {
            videoQuadRef.current = null;
          }
        }
      }

      const diagKey = `${snap.state}|${snap.method}|${snap.confidence.toFixed(2)}`;
      if (diagKey !== lastDiag) {
        lastDiag = diagKey;
        setDiag({
          state: snap.state,
          confidence: snap.confidence,
          method: snap.method,
        });
        if (!calibrateModeRef.current) {
          setStatus(
            snap.state === "tracking"
              ? "Board locked — solder the highlighted pad"
              : snap.state === "reacquiring"
                ? "Tracking weak — hold steady or calibrate"
                : snap.state === "calibrating"
                  ? "Manual lock + optical flow"
                  : "Seeking board… one module, good light"
          );
        }
      }

      // Draw AR
      ctx.clearRect(0, 0, pxW, pxH);
      const qVideo = videoQuadRef.current;

      if (qVideo && qVideo.length === 4) {
        const q = qVideo.map((p) => {
          const c = maps.videoToCss(p.x, p.y);
          return { x: c.x * dpr, y: c.y * dpr };
        });

        ctx.strokeStyle = "rgba(34, 211, 238, 0.9)";
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.moveTo(q[0]!.x, q[0]!.y);
        for (let i = 1; i < 4; i++) ctx.lineTo(q[i]!.x, q[i]!.y);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = "rgba(14, 116, 144, 0.12)";
        ctx.fill();

        const H = computeHomography(UNIT_QUAD, q);
        if (H) {
          const pinUv = resolvePinUv(activePin, catalogId);
          const screen = applyHomography(H, uvToPt(pinUv));

          for (const p of pinLayoutForCatalog(catalogId)) {
            if (p.name.toUpperCase() === pinUv.name.toUpperCase()) continue;
            const sp = applyHomography(H, uvToPt(p));
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, 3.5 * dpr, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fill();
          }

          const t = (performance.now() % 1000) / 1000;
          const r = 15 * dpr * (1 + 0.18 * Math.sin(t * Math.PI * 2));

          ctx.beginPath();
          ctx.arc(screen.x, screen.y, r * 1.55, 0, Math.PI * 2);
          ctx.strokeStyle = micro.colorHex;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 4 * dpr;
          ctx.stroke();
          ctx.globalAlpha = 1;

          ctx.beginPath();
          ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
          ctx.fillStyle = micro.colorHex;
          ctx.fill();
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2.5 * dpr;
          ctx.stroke();

          const label = `SOLDER ${activePin}`;
          ctx.font = `bold ${12 * dpr}px ui-monospace, monospace`;
          const tw = ctx.measureText(label).width;
          const lx = screen.x - tw / 2 - 8 * dpr;
          const ly = screen.y - r - 26 * dpr;
          ctx.fillStyle = "rgba(11,14,19,0.92)";
          roundRect(ctx, lx, ly, tw + 16 * dpr, 20 * dpr, 5 * dpr);
          ctx.fill();
          ctx.strokeStyle = micro.colorHex;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.fillText(label, lx + 8 * dpr, ly + 14 * dpr);
        }
      }

      if (calibrateModeRef.current) {
        for (let i = 0; i < calibratePts.current.length; i++) {
          const p = calibratePts.current[i]!;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8 * dpr, 0, Math.PI * 2);
          ctx.fillStyle = "#22d3ee";
          ctx.fill();
          ctx.fillStyle = "#0b0e13";
          ctx.font = `bold ${11 * dpr}px system-ui`;
          ctx.fillText(String(i + 1), p.x - 3 * dpr, p.y + 4 * dpr);
        }
      }

      // Confidence bar
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(8 * dpr, pxH - 12 * dpr, pxW - 16 * dpr, 5 * dpr);
      ctx.fillStyle =
        snap.confidence > 0.35
          ? "#22d3ee"
          : snap.confidence > 0.12
            ? "#f5a623"
            : "#64748b";
      ctx.fillRect(
        8 * dpr,
        pxH - 12 * dpr,
        (pxW - 16 * dpr) * Math.min(1, Math.max(0, snap.confidence)),
        5 * dpr
      );

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [ready, activePin, catalogId, micro.colorHex, coverMaps]);

  const onStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!calibrateModeRef.current) return;
      const stage = stageRef.current;
      const video = videoRef.current;
      if (!stage || !video) return;
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      calibratePts.current = [
        ...calibratePts.current,
        { x: cssX * dpr, y: cssY * dpr },
      ];
      const n = calibratePts.current.length;
      setStatus(
        `Corner ${n}/4 — ${["top-left", "top-right", "bottom-right", "bottom-left"][n - 1] ?? "done"}`
      );

      if (n >= 4) {
        const maps = coverMaps(
          video.videoWidth,
          video.videoHeight,
          rect.width,
          rect.height
        );
        const videoPts = orderCorners(
          calibratePts.current.slice(0, 4).map((p) => {
            const css = { x: p.x / dpr, y: p.y / dpr };
            return maps.cssToVideo(css.x, css.y);
          })
        );
        const workH = Math.max(
          40,
          Math.round((video.videoHeight / video.videoWidth) * WORK_W)
        );
        const workPts = videoPts.map((p) => ({
          x: (p.x / video.videoWidth) * WORK_W,
          y: (p.y / video.videoHeight) * workH,
        }));
        trackerRef.current.setManualQuad(workPts);
        videoQuadRef.current = videoPts;
        calibratePts.current = [];
        calibrateModeRef.current = false;
        setCalibrateMode(false);
        setStatus("Manual lock — solder the highlighted pad");
      }
    },
    [coverMaps]
  );

  const startCalibrate = () => {
    calibratePts.current = [];
    calibrateModeRef.current = true;
    setCalibrateMode(true);
    trackerRef.current.reset();
    videoQuadRef.current = null;
    setStatus("Tap 4 corners: TL → TR → BR → BL");
  };

  const startAuto = () => {
    calibratePts.current = [];
    calibrateModeRef.current = false;
    setCalibrateMode(false);
    trackerRef.current.reset();
    videoQuadRef.current = null;
    setStatus("Auto hybrid track — seeking board…");
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-console-bg text-console-text">
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-console-border bg-console-surface">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-3 text-sm font-semibold cursor-pointer"
        >
          ← Exit AR
        </button>
        <p className="text-xs font-mono text-console-text-muted truncate">
          {detectorLabel} · {STATE_LABEL[diag.state]} · {diag.method}
        </p>
        <button
          type="button"
          onClick={onMarkDone}
          className={`min-h-11 px-3 rounded-lg text-sm font-bold cursor-pointer ${
            isDone ? "bg-success text-white" : "bg-console-accent text-console-bg"
          }`}
        >
          {isDone ? "Done" : "Mark done"}
        </button>
      </div>

      <div
        ref={stageRef}
        className="relative flex-1 min-h-0 bg-black overflow-hidden touch-none"
        onClick={onStageClick}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
          aria-label="Live AR camera"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden
        />

        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-console-text-muted">
            Starting hybrid AR…
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm">
            {err}
          </div>
        )}

        <div className="absolute top-2 left-2 right-2 flex flex-col gap-2 pointer-events-none">
          <div
            className="rounded-xl border px-3 py-2 pointer-events-auto"
            style={{
              borderColor: micro.colorHex,
              background: "rgba(11,14,19,0.9)",
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-console-accent">
              {STATE_LABEL[diag.state]} · conf {(diag.confidence * 100).toFixed(0)}%
              {diag.method !== "none" ? ` · ${diag.method}` : ""}
            </p>
            <p className="text-lg font-mono font-black">
              {activePin}
              <span className="text-console-text-muted font-sans font-normal text-sm ml-2">
                {activeLabel}
              </span>
            </p>
            <p className="text-[11px] text-console-text-muted mt-0.5">{status}</p>
            <p className="text-[11px] text-console-text-muted">
              Other end:{" "}
              <span className="font-mono text-console-text">{otherPin}</span>
            </p>
          </div>
          <div className="flex gap-2 pointer-events-auto">
            <button
              type="button"
              onClick={() => setFace("from")}
              className={`flex-1 min-h-11 rounded-xl text-xs font-bold cursor-pointer border ${
                face === "from"
                  ? "bg-console-accent text-console-bg border-console-accent"
                  : "bg-console-surface/95 border-console-border"
              }`}
            >
              A · {micro.fromPin}
            </button>
            <button
              type="button"
              onClick={() => setFace("to")}
              className={`flex-1 min-h-11 rounded-xl text-xs font-bold cursor-pointer border ${
                face === "to"
                  ? "bg-console-accent text-console-bg border-console-accent"
                  : "bg-console-surface/95 border-console-border"
              }`}
            >
              B · {micro.toPin}
            </button>
          </div>
        </div>

        {activeItem?.photoDataUrl && (
          <div className="absolute bottom-16 right-2 w-20 rounded-lg overflow-hidden border border-console-accent pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeItem.photoDataUrl}
              alt=""
              className="w-full h-16 object-cover"
            />
          </div>
        )}

        <div className="absolute bottom-2 left-2 right-2 flex gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={startCalibrate}
            className="flex-1 min-h-11 rounded-xl bg-console-surface border border-console-border text-xs font-semibold cursor-pointer"
          >
            {calibrateMode ? "Tap corners…" : "Calibrate 4 corners"}
          </button>
          <button
            type="button"
            onClick={startAuto}
            className="min-h-11 px-3 rounded-xl bg-console-surface border border-console-border text-xs font-semibold cursor-pointer"
          >
            Auto hybrid
          </button>
        </div>
      </div>

      <div className="shrink-0 border-t border-console-border bg-console-surface">
        <button
          type="button"
          onClick={() => setShowMap((v) => !v)}
          className="w-full min-h-11 text-xs font-semibold text-console-accent cursor-pointer"
        >
          {showMap ? "Hide reference map" : "Show reference map"}
        </button>
        {showMap && (
          <div className="max-h-[36vh] overflow-y-auto p-2 bg-console-bg">
            <PinConnectionDiagram micro={micro} className="border-0 shadow-none rounded-xl" />
          </div>
        )}
      </div>
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

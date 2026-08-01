"use client";

/**
 * getUserMedia still-frame capture for part scanning.
 * Prefer environment (back) camera on phones; fall back to any video input.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function CameraCapture({
  onCapture,
  onError,
  className = "",
}: {
  onCapture: (dataUrl: string, mediaType: "image/jpeg") => void;
  onError?: (message: string) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        const msg = "Camera not available in this browser.";
        setErr(msg);
        onError?.(msg);
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
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
        }
      } catch {
        const msg =
          "Could not open the camera — allow permission, or use file upload instead.";
        setErr(msg);
        onError?.(msg);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [onError, stop]);

  const snap = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    onCapture(dataUrl, "image/jpeg");
  };

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="relative rounded-xl overflow-hidden border border-border-strong bg-console-bg aspect-[4/3] max-h-[360px]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover"
          aria-label="Camera preview for part scan"
        />
        {!ready && !err && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-console-text-muted">
            Starting camera…
          </div>
        )}
        {err && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-console-text">
            {err}
          </div>
        )}
        {/* Viewfinder guide */}
        <div
          className="pointer-events-none absolute inset-6 border-2 border-dashed border-console-accent/50 rounded-lg"
          aria-hidden
        />
        <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-xs text-console-text font-medium drop-shadow">
          Fill the frame with one module · silkscreen readable
        </p>
      </div>
      <button
        type="button"
        disabled={!ready}
        onClick={snap}
        className="min-h-11 rounded-xl bg-accent text-white text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Capture this part
      </button>
    </div>
  );
}

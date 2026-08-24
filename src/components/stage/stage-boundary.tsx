"use client";

import { Component, type ReactNode } from "react";
import { diagLog } from "@/lib/diag";

/**
 * The 3D Stage is enhancement-only. A WebGL context loss or a renderer init
 * failure (e.g. an interrupted mount disposing the renderer) must NEVER take
 * down the build. Parts, wiring, guided solder steps and the firmware package
 * all render without the Stage.
 *
 * Without a boundary here the throw bubbles to the route-level error.tsx and
 * replaces the whole build with "Something went wrong." This local boundary
 * catches it and swaps in a calm fallback, keeping the surrounding page alive.
 * The Stage's own in-scene boundary (parts-layer) only catches errors INSIDE
 * the Canvas tree — a renderer failure happens at mount, above it.
 */
export class StageBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    diagLog("info", `3D stage failed; showing fallback instead: ${msg}`);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

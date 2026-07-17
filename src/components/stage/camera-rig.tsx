"use client";

/**
 * CameraRig — the single owner of the Stage camera.
 *
 * Deterministic by construction: on mount it JUMPS (no transition) to the given
 * shot, so the first rendered frame is identical on every load. Subsequent shot
 * changes glide via camera-controls' damped setLookAt. Nothing else in the tree
 * is allowed to touch the camera.
 *
 * Idle orbit: after 8s without interaction the product turns slowly (off under
 * prefers-reduced-motion, off while a non-default shot is focused). Runs on the
 * demand frameloop by self-invalidating only while actually turning.
 */
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import type { PerspectiveCamera } from "three";
import type { StageShot } from "@/lib/stage/shots";
import { invalidateStage } from "./stage-invalidate";

type ControlsRef = ComponentRef<typeof CameraControls>;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function CameraRig({
  shot,
  idleOrbit = true,
}: {
  shot: StageShot;
  idleOrbit?: boolean;
}) {
  const controls = useRef<ControlsRef>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const reducedMotion = usePrefersReducedMotion();
  const mounted = useRef(false);
  const lastInteract = useRef(0);
  const orbiting = useRef(false);
  // Demand-frameloop contract: camera-controls' damped tween advances only on
  // rendered frames, so WHILE a transition (or drag) is live we self-invalidate
  // every frame; at 'rest' we stop and the scene renders 0 fps again.
  const moving = useRef(false);

  // Apply the shot. First application snaps (deterministic frame 1); later
  // ones glide unless reduced motion is on.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const transition = mounted.current && !reducedMotion;
    c.smoothTime = 0.55;
    if (camera.fov !== shot.fov) {
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    void c.setLookAt(
      shot.position[0],
      shot.position[1],
      shot.position[2],
      shot.target[0],
      shot.target[1],
      shot.target[2],
      transition
    );
    mounted.current = true;
    invalidateStage();
  }, [shot, camera, reducedMotion]);

  // Motion bookkeeping: user drags and shot transitions mark `moving`, the
  // 'rest' event clears it. The frame callback below keeps frames flowing only
  // while moving — this is what makes glides work under frameloop="demand".
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const start = () => {
      lastInteract.current = Date.now();
      orbiting.current = false;
      moving.current = true;
      invalidateStage();
    };
    const stop = () => {
      moving.current = false;
      lastInteract.current = Date.now();
    };
    c.addEventListener("controlstart", start);
    c.addEventListener("control", start);
    c.addEventListener("transitionstart", start);
    c.addEventListener("rest", stop);
    c.addEventListener("sleep", stop);
    return () => {
      c.removeEventListener("controlstart", start);
      c.removeEventListener("control", start);
      c.removeEventListener("transitionstart", start);
      c.removeEventListener("rest", stop);
      c.removeEventListener("sleep", stop);
    };
  }, []);

  // Idle-orbit heartbeat: a 1s timer decides whether to (re)start turning; the
  // frame callback advances + self-invalidates only while turning.
  const idleEligible = idleOrbit && !reducedMotion && shot.id === "hero";
  useEffect(() => {
    if (!idleEligible) {
      orbiting.current = false;
      return;
    }
    lastInteract.current = Date.now();
    const t = setInterval(() => {
      if (!orbiting.current && Date.now() - lastInteract.current > 8_000) {
        orbiting.current = true;
        invalidateStage();
      }
    }, 1_000);
    return () => {
      clearInterval(t);
      orbiting.current = false;
    };
  }, [idleEligible]);

  useFrame((_, delta) => {
    if (moving.current) invalidateStage();
    if (orbiting.current && controls.current) {
      controls.current.azimuthAngle += delta * 0.1;
      invalidateStage();
    }
  });

  return <CameraControls ref={controls} makeDefault />;
}

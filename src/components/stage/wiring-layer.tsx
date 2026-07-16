"use client";

/**
 * Wiring layer — EXACT wires, rendered from the WirePlan truth packet.
 *
 * Every tube is a netlist net: CatmullRomCurve3 through the routed polyline →
 * TubeGeometry, colored by the single wire-color authority, landing on named
 * pins at datasheet-mm coords. A fat invisible hit tube makes thin wires
 * tappable; tapping traces the wire (pulse bead + dim others) and opens a
 * callout card with the specifics: color name, net, ref pin → ref pin, and
 * the cut length measured along the actual route.
 *
 * Draw-on: wires appear with their assembly phase (wire-reveal.ts) by growing
 * the tube's drawn portion — geometry is sliced by progress, cheap at these
 * point counts, zero shader patching.
 */
import { useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, Vector3, type Mesh } from "three";
import type { AssemblyRecipe } from "@/lib/product-3d";
import type { PlannedWire, WirePlan } from "@/lib/stage/wire-plan";
import { wireRevealT } from "@/lib/stage/wire-reveal";
import { invalidateStage } from "./stage-invalidate";

function curveFor(wire: PlannedWire, rootScale: number): CatmullRomCurve3 {
  const pts = wire.route.path.map(
    (p) => new Vector3(p[0] * rootScale, p[1] * rootScale, p[2] * rootScale)
  );
  return new CatmullRomCurve3(pts, false, "catmullrom", 0.35);
}

/** Trace bead — a bright pulse riding the tapped wire's curve. */
function TraceBead({ curve }: { curve: CatmullRomCurve3 }) {
  const ref = useRef<Mesh>(null);
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current = (t.current + delta * 0.45) % 1;
    ref.current?.position.copy(curve.getPointAt(t.current));
    invalidateStage();
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.016, 12, 12]} />
      <meshStandardMaterial
        color="#dff6ff"
        emissive="#7dd3fc"
        emissiveIntensity={3.2}
        toneMapped={false}
      />
    </mesh>
  );
}

function WireTube({
  wire,
  rootScale,
  drawT,
  dimmed,
  active,
  onTap,
}: {
  wire: PlannedWire;
  rootScale: number;
  /** 0..1 draw-on progress (assembly reveal). 0 → not rendered. */
  drawT: number;
  dimmed: boolean;
  active: boolean;
  onTap?: (id: string | null) => void;
}) {
  const full = useMemo(() => curveFor(wire, rootScale), [wire, rootScale]);
  // Draw-on: slice the polyline by progress and rebuild a short curve. The
  // route polylines are ≤ ~12 points, so this is cheap and rock-solid.
  const shown = useMemo(() => {
    if (drawT >= 0.999) return full;
    const pts = full.getPoints(32);
    const upto = Math.max(2, Math.ceil(pts.length * drawT));
    return new CatmullRomCurve3(pts.slice(0, upto), false, "catmullrom", 0.1);
  }, [full, drawT]);
  const gauge = wire.route.gauge * rootScale * (active ? 1.25 : 1);
  const opacity = dimmed ? 0.16 : 1;
  return (
    <group>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(wire.route.id);
        }}
      >
        <tubeGeometry args={[shown, 40, gauge, 10, false]} />
        <meshPhysicalMaterial
          color={wire.route.color}
          roughness={0.42}
          clearcoat={0.6}
          clearcoatRoughness={0.3}
          transparent={opacity < 0.99}
          opacity={opacity}
          emissive={active ? wire.route.color : "#000000"}
          emissiveIntensity={active ? 0.45 : 0}
        />
      </mesh>
      {/* Fat invisible hit tube — thin wires stay tappable on any device */}
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onTap?.(wire.route.id);
        }}
        visible={false}
      >
        <tubeGeometry args={[shown, 24, Math.max(gauge * 4, 0.028), 6, false]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {active && <TraceBead curve={full} />}
      {active && (
        <Html
          position={full.getPointAt(0.5)}
          center
          distanceFactor={3.5}
          style={{ pointerEvents: "none" }}
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-950/92 border border-cyan-400/50 shadow-xl whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-50">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border border-white/40"
                style={{ background: wire.route.color }}
              />
              {wire.colorName} · {wire.route.netName}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              {wire.endpoints} · ~{wire.lengthMm}mm
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Labeled net-colored endpoint pads (wire mode). */
function PadsLayer({ plan, rootScale }: { plan: WirePlan; rootScale: number }) {
  return (
    <group>
      {plan.pads.map((pad) => (
        <group
          key={`${pad.nodeId}:${pad.pin}`}
          position={[
            pad.posMm[0] * rootScale,
            pad.posMm[1] * rootScale,
            pad.posMm[2] * rootScale,
          ]}
        >
          <mesh>
            <sphereGeometry args={[0.01, 10, 10]} />
            <meshBasicMaterial color={pad.color} />
          </mesh>
          <Html center distanceFactor={3.2} style={{ pointerEvents: "none" }}>
            <div
              className="px-1 py-px rounded text-[8px] leading-tight font-mono font-semibold text-white shadow-sm whitespace-nowrap"
              style={{ background: `${pad.color}dd`, transform: "translateY(-11px)" }}
            >
              {pad.pin}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}

export function WiringLayer({
  plan,
  recipe,
  rootScale,
  scrub,
  showPads = false,
  activeWireId,
  onWireTap,
}: {
  plan: WirePlan;
  recipe: AssemblyRecipe;
  rootScale: number;
  /** Continuous assembly scrub — drives per-wire draw-on reveal. */
  scrub: number;
  showPads?: boolean;
  activeWireId?: string | null;
  onWireTap?: (id: string | null) => void;
}) {
  return (
    <group>
      {plan.wires.map((wire) => {
        const drawT = wireRevealT(wire.route, scrub, recipe);
        if (drawT <= 0.02) return null;
        return (
          <WireTube
            key={wire.route.id}
            wire={wire}
            rootScale={rootScale}
            drawT={drawT}
            dimmed={!!activeWireId && activeWireId !== wire.route.id}
            active={activeWireId === wire.route.id}
            onTap={onWireTap}
          />
        );
      })}
      {showPads && <PadsLayer plan={plan} rootScale={rootScale} />}
    </group>
  );
}

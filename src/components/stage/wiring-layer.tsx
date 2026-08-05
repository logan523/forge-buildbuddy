"use client";

/**
 * Wiring layer — EXACT wires, rendered from the WirePlan truth packet.
 *
 * Every tube is a netlist net: CatmullRomCurve3 through the routed polyline →
 * TubeGeometry, colored by the single wire-color authority, landing on named
 * pins at datasheet-mm coords. A fat invisible hit tube makes thin wires
 * tappable; tapping traces the wire (width bump + dim others) and opens a
 * callout card with the specifics: color name, net, ref pin → ref pin, and
 * the cut length measured along the actual route.
 *
 * Technical-light: tubes are matte flat-color (lambert, no clearcoat, no
 * emissive pulse), endpoint dots are flat — the same state language as the
 * 2D wiring sheet: current = saturated + width bump, done = solid, pending
 * = ghost. Draw-on: wires appear with their assembly phase (wire-reveal.ts)
 * by growing the tube's drawn portion — geometry is sliced by progress,
 * cheap at these point counts, zero shader patching.
 */
import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { CatmullRomCurve3, Vector3 } from "three";
import type { AssemblyRecipe } from "@/lib/product-3d";
import type { PlannedWire, WirePlan } from "@/lib/stage/wire-plan";
import { wireRevealT } from "@/lib/stage/wire-reveal";

function curveFor(wire: PlannedWire, rootScale: number): CatmullRomCurve3 {
  const pts = wire.route.path.map(
    (p) => new Vector3(p[0] * rootScale, p[1] * rootScale, p[2] * rootScale)
  );
  return new CatmullRomCurve3(pts, false, "catmullrom", 0.35);
}

function WireTubeRoute({
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
        {/* Matte flat-color tube (technical-light): no clearcoat, no emissive
            pulse. State reads through color saturation + gauge, like the 2D
            sheet: current = saturated + width bump, dimmed = ghost. */}
        <meshLambertMaterial
          color={wire.route.color}
          transparent={opacity < 0.99}
          opacity={opacity}
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
      {/* Endpoint dots — flat, wire-colored, where the wire meets each pad.
          (Replaces the metallic solder-meniscus spheres.) */}
      {drawT >= 0.999 &&
        ([full.getPointAt(0), full.getPointAt(1)] as const).map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[Math.max(gauge * 1.7, 0.008), 10, 10]} />
            <meshBasicMaterial
              color={wire.route.color}
              transparent={opacity < 0.99}
              opacity={opacity}
            />
          </mesh>
        ))}
      {active && (
        <Html
          position={full.getPointAt(0.5)}
          center
          distanceFactor={3.5}
          style={{ pointerEvents: "none" }}
        >
          <div className="px-2.5 py-1.5 rounded-lg bg-surface-raised/95 border border-border-subtle shadow-card whitespace-nowrap">
            <div className="flex items-center gap-1.5 text-xs font-medium text-text">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full border border-border"
                style={{ background: wire.route.color }}
              />
              {wire.colorName} · {wire.route.netName}
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
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
            {/* Pin label: token chip + net-color dot, 11px mono floor. The old
                8px white-on-color text was illegible and failed contrast. */}
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border-subtle bg-surface/95 text-2xs leading-tight font-mono font-semibold text-text shadow-card whitespace-nowrap"
              style={{ transform: "translateY(-14px)" }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: pad.color }}
                aria-hidden="true"
              />
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
          <WireTubeRoute
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

/**
 * Spatial reasoning brain — design-intent layout rules for ProductScene3D.
 * Thinks through physics/UX of the product: solar faces sky, display faces user, power low, etc.
 * Pure functions; never invents nets or BOM — only poses geometry intelligently.
 */
import type { ProductScene3D, SceneNode3D } from "./types";

export interface SpatialReasonNote {
  id: string;
  rule: string;
  nodeIds: string[];
  detail: string;
}

export interface SpatialReasonResult {
  scene: ProductScene3D;
  notes: SpatialReasonNote[];
}

function cloneNode(n: SceneNode3D): SceneNode3D {
  return {
    ...n,
    position: [...n.position] as [number, number, number],
    rotation: [...n.rotation] as [number, number, number],
    geom: { ...n.geom, params: { ...n.geom.params } },
    material: { ...n.material },
  };
}

function isSolar(n: SceneNode3D): boolean {
  return (
    n.layer === "wings" ||
    n.geom.kind === "solar_module" ||
    n.geom.kind === "solar_panel" ||
    n.id.startsWith("solar")
  );
}

function isDisplay(n: SceneNode3D): boolean {
  return (
    n.layer === "face" ||
    n.geom.kind === "oled_module" ||
    n.geom.kind === "oled_panel" ||
    n.id === "face"
  );
}

function isPower(n: SceneNode3D): boolean {
  return n.layer === "power" || n.id === "battery" || n.id === "charger";
}

function maxY(nodes: SceneNode3D[]): number {
  return nodes.reduce((m, n) => Math.max(m, n.position[1]), 0);
}

function faceY(nodes: SceneNode3D[]): number {
  const d = nodes.find(isDisplay);
  return d?.position[1] ?? 80;
}

/**
 * Solar active face is local +Z on our meshes.
 * Want normal to point skyward-outward: significant +Y and ±X for wings.
 * Euler XYZ: pitch (X) negative lifts +Z toward +Y; roll (Z) dihedral; small yaw.
 */
function solarWingPose(
  side: "left" | "right" | "center",
  faceHeight: number
): { position: [number, number, number]; rotation: [number, number, number] } {
  // Elevate above face so panels clear frame and catch light
  const y = faceHeight + 22;
  // Dihedral ~35°, pitch ~55° toward sky (active face up-out)
  const pitch = -0.95; // ~-54° about X: +Z → up-out
  if (side === "left") {
    return {
      position: [-68, y, 8],
      rotation: [pitch, 0.15, 0.55], // roll opens wing left, slight yaw
    };
  }
  if (side === "right") {
    return {
      position: [68, y, 8],
      rotation: [pitch, -0.15, -0.55],
    };
  }
  return {
    position: [0, y + 8, -12],
    rotation: [pitch * 0.85, 0, 0],
  };
}

/** Apply all spatial design rules to a built scene. */
export function applySpatialReasoning(scene: ProductScene3D): SpatialReasonResult {
  const notes: SpatialReasonNote[] = [];
  const nodes = scene.nodes.map(cloneNode);
  const template = scene.templateId;
  const fy = faceY(nodes);

  // ── Rule: solar_sky_facing + solar_elevated ──
  // Panels only (not spars) — spars repositioned to connect frame→panel
  const solars = nodes.filter(
    (n) => isSolar(n) && (n.geom.kind === "solar_module" || n.geom.kind === "solar_panel" || n.id.startsWith("solar-"))
  );
  if (solars.length > 0) {
    const ids: string[] = [];
    for (const n of solars) {
      const side: "left" | "right" | "center" =
        n.id.includes("-l") || n.id.endsWith("l") || n.position[0] < -5
          ? "left"
          : n.id.includes("-r") || n.id.endsWith("r") || n.position[0] > 5
            ? "right"
            : "center";
      const pose = solarWingPose(side, fy);
      n.position = pose.position;
      n.rotation = pose.rotation;
      n.explodeDir = side === "left" ? [-1.4, 0.8, 0.3] : side === "right" ? [1.4, 0.8, 0.3] : [0, 1.2, -0.4];
      ids.push(n.id);
    }
    // Spars: midpoint between frame center and solar panel
    const frame = nodes.find((n) => n.id === "frame");
    const fx = frame?.position[0] ?? 0;
    const fy0 = frame?.position[1] ?? fy;
    const fz = frame?.position[2] ?? 0;
    for (const n of nodes) {
      if (!n.id.startsWith("spar-")) continue;
      const left = n.id.includes("-l") || n.id.endsWith("l");
      const panel = solars.find((s) =>
        left ? s.id.includes("-l") || s.position[0] < 0 : s.id.includes("-r") || s.position[0] > 0
      );
      if (!panel) continue;
      const mx = (fx + (left ? -20 : 20) + panel.position[0]) / 2;
      const my = (fy0 + panel.position[1]) / 2;
      const mz = (fz + panel.position[2]) / 2;
      n.position = [mx, my, mz];
      // Aim spar roughly toward panel
      const dx = panel.position[0] - mx;
      const dy = panel.position[1] - my;
      n.rotation = [0, 0, left ? Math.atan2(dy, -dx) : -Math.atan2(dy, dx)];
      ids.push(n.id);
    }
    notes.push({
      id: "solar_sky",
      rule: "Solar faces the sky",
      nodeIds: ids,
      detail: `Elevated above display (y≈${Math.round(fy + 22)}mm) and pitched ~55° so the active face collects light.`,
    });
  }

  // ── Rule: display_forward (face user / +Z) ──
  const displays = nodes.filter(isDisplay);
  if (displays.length > 0) {
    for (const n of displays) {
      // Keep slight upright; face +Z (viewer)
      n.rotation = [n.rotation[0] * 0.15, n.rotation[1], 0];
      n.position = [n.position[0], n.position[1], Math.max(n.position[2], 5)];
    }
    notes.push({
      id: "display_forward",
      rule: "Display faces the user",
      nodeIds: displays.map((n) => n.id),
      detail: "OLED/active surface oriented toward the viewer (+Z) for readability.",
    });
  }

  // ── Rule: power_low (mass near base) ──
  const power = nodes.filter(isPower);
  if (power.length > 0 && template !== "breadboard") {
    for (const n of power) {
      if (n.position[1] > 40) {
        n.position = [n.position[0], Math.min(n.position[1], 18), n.position[2]];
      }
    }
    notes.push({
      id: "power_low",
      rule: "Power sits low",
      nodeIds: power.map((n) => n.id),
      detail: "Battery and charge circuit stay near the base for stability and short power runs.",
    });
  }

  // ── Rule: brain_mid (MCU mid-structure, serviceable) ──
  const brains = nodes.filter((n) => n.layer === "brain" || n.id === "brain");
  if (brains.length > 0) {
    for (const n of brains) {
      // Mid height, slightly proud of structure
      const mid = Math.max(48, Math.min(fy - 20, 70));
      n.position = [n.position[0], mid, Math.max(n.position[2], 10)];
    }
    notes.push({
      id: "brain_mid",
      rule: "Controller mid-structure",
      nodeIds: brains.map((n) => n.id),
      detail: "MCU placed mid-height for wiring reach and heat access.",
    });
  }

  // ── Rule: touch_top (reachable input) ──
  const touches = nodes.filter((n) => n.layer === "touch" || n.id === "touch");
  if (touches.length > 0) {
    const top = maxY(nodes.filter((n) => !touches.includes(n)));
    for (const n of touches) {
      n.position = [n.position[0], Math.max(n.position[1], top + 6), n.position[2]];
    }
    notes.push({
      id: "touch_top",
      rule: "Controls on top",
      nodeIds: touches.map((n) => n.id),
      detail: "Touch/button sits at the highest reachable surface.",
    });
  }

  // ── Rule: sensor_exposed ──
  const sensors = nodes.filter((n) => n.layer === "sensor" || n.id === "sensor" || n.id.includes("sensor"));
  if (sensors.length > 0) {
    for (const n of sensors) {
      // Slightly proud / outboard so it can "see" air
      n.position = [n.position[0], n.position[1], Math.max(n.position[2], 12)];
    }
    notes.push({
      id: "sensor_exposed",
      rule: "Sensor exposed",
      nodeIds: sensors.map((n) => n.id),
      detail: "Environmental sensors sit proud of the chassis for airflow.",
    });
  }

  // ── Rule: mast_upright (weather stick) ──
  if (template === "weather_stick") {
    const mast = nodes.find((n) => n.layer === "mast" || n.id === "mast");
    const head = nodes.find((n) => n.layer === "sensor");
    if (mast && head) {
      head.position = [0, Math.max(head.position[1], mast.position[1] + 80), 0];
      notes.push({
        id: "mast_upright",
        rule: "Sensor head on mast",
        nodeIds: [mast.id, head.id],
        detail: "Weather sensors mount at the top of the stake for clear exposure.",
      });
    }
  }

  // ── Rule: wheels_ground (robot) ──
  if (template === "robot_chassis") {
    const wheels = nodes.filter((n) => n.layer === "wheels");
    for (const w of wheels) {
      w.position = [w.position[0], Math.min(w.position[1], 14), w.position[2]];
    }
    if (wheels.length) {
      notes.push({
        id: "wheels_ground",
        rule: "Wheels on ground plane",
        nodeIds: wheels.map((n) => n.id),
        detail: "Drive wheels contact Y≈0 so the chassis sits realistically.",
      });
    }
  }

  // ── Structural spars: if solar wings exist, ensure frame explode still sane ──
  // (visual spars added in builder if needed)

  return {
    scene: {
      ...scene,
      nodes,
      reasoningNotes: notes,
    },
    notes,
  };
}

/** Summarize notes for UI chips (short labels). */
export function reasoningChips(notes: SpatialReasonNote[]): string[] {
  return notes.map((n) => n.rule);
}

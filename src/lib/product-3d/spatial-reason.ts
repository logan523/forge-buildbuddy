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
 * Solar wings for wire-cube sat_clock: attach at cube mid-sides, slight dihedral.
 * Active face is local +Z — mild pitch so glass catches light without tower pose.
 */
function solarWingPoseCube(
  side: "left" | "right" | "center",
  cageCenter: [number, number, number],
  cageSize: number,
  wingW: number
): { position: [number, number, number]; rotation: [number, number, number] } {
  const [cx, cy, cz] = cageCenter;
  const xOff = cageSize / 2 + wingW * 0.48;
  const pitch = 0.1; // slight up toward light
  if (side === "left") {
    return {
      position: [cx - xOff, cy + cageSize * 0.06, cz],
      rotation: [pitch, 0, 0.1],
    };
  }
  if (side === "right") {
    return {
      position: [cx + xOff, cy + cageSize * 0.06, cz],
      rotation: [pitch, 0, -0.1],
    };
  }
  return {
    position: [cx, cy + cageSize * 0.4, cz - xOff * 0.5],
    rotation: [pitch, 0, 0],
  };
}

function getCageCenter(nodes: SceneNode3D[]): { center: [number, number, number]; size: number } {
  const frame = nodes.find((n) => n.id === "frame" || n.geom.kind === "wire_cube_cage");
  if (frame) {
    const size = frame.geom.params.size || 58;
    return { center: [...frame.position] as [number, number, number], size };
  }
  return { center: [0, 100, 0], size: 58 };
}

/** Apply all spatial design rules to a built scene. */
export function applySpatialReasoning(scene: ProductScene3D): SpatialReasonResult {
  const notes: SpatialReasonNote[] = [];
  const nodes = scene.nodes.map(cloneNode);
  const template = scene.templateId;
  const isCubeSat = template === "sat_clock" && nodes.some((n) => n.geom.kind === "wire_cube_cage");
  const { center: cageC, size: cageSize } = getCageCenter(nodes);

  // ── Rule: solar wings (cube sat vs tower) ──
  const solars = nodes.filter(
    (n) =>
      isSolar(n) &&
      (n.geom.kind === "solar_module" || n.geom.kind === "solar_panel" || n.id.startsWith("solar-"))
  );
  if (solars.length > 0) {
    const ids: string[] = [];
    for (const n of solars) {
      const side: "left" | "right" | "center" =
        n.id.includes("-l") || n.position[0] < -5
          ? "left"
          : n.id.includes("-r") || n.position[0] > 5
            ? "right"
            : "center";
      if (isCubeSat) {
        const wingW = n.geom.params.width || cageSize * 1.1;
        const pose = solarWingPoseCube(side, cageC, cageSize, wingW);
        n.position = pose.position;
        n.rotation = pose.rotation;
        n.explodeDir = side === "left" ? [-1.3, 0.15, 0] : side === "right" ? [1.3, 0.15, 0] : [0, 0.5, -1];
      }
      ids.push(n.id);
    }
    // Short spars for cube sat
    if (isCubeSat) {
      for (const n of nodes) {
        if (!n.id.startsWith("spar-")) continue;
        const left = n.id.includes("-l");
        const panel = solars.find((s) => (left ? s.position[0] < 0 : s.position[0] > 0));
        if (!panel) continue;
        n.position = [
          (cageC[0] + panel.position[0]) / 2,
          panel.position[1],
          (cageC[2] + panel.position[2]) / 2,
        ];
        n.rotation = [0, 0, Math.PI / 2];
        ids.push(n.id);
      }
    }
    notes.push({
      id: "solar_sky",
      rule: "Solar wings on cage",
      nodeIds: ids,
      detail: isCubeSat
        ? "Dual solar panels attach at cube mid-sides with slight dihedral (photo silhouette)."
        : "Solar panels oriented to collect light.",
    });
  }

  // ── Rule: display_forward ──
  const displays = nodes.filter(isDisplay);
  if (displays.length > 0) {
    for (const n of displays) {
      if (isCubeSat) {
        // Front face of cube
        n.position = [cageC[0], cageC[1], cageC[2] + cageSize / 2 + 1.5];
        n.rotation = [0, 0, 0];
      } else {
        n.rotation = [n.rotation[0] * 0.15, n.rotation[1], 0];
        n.position = [n.position[0], n.position[1], Math.max(n.position[2], 5)];
      }
    }
    notes.push({
      id: "display_forward",
      rule: "Display faces the user",
      nodeIds: displays.map((n) => n.id),
      detail: isCubeSat
        ? "OLED module mounted on the front face of the wire cage."
        : "OLED oriented toward the viewer (+Z).",
    });
  }

  // ── Rule: power ──
  const power = nodes.filter(isPower);
  if (power.length > 0 && template !== "breadboard") {
    if (isCubeSat) {
      // Keep battery / straps inside cage volume
      for (const n of power) {
        if (n.id === "battery" || n.id === "straps") {
          n.position = [cageC[0], cageC[1] + 2, cageC[2] - 4];
        } else if (n.id === "charger") {
          n.position = [cageC[0], cageC[1] - 8, cageC[2] - cageSize / 2 - 1];
        }
      }
      notes.push({
        id: "power_in_cage",
        rule: "Battery in cage",
        nodeIds: power.map((n) => n.id),
        detail: "Cell sits inside the brass wire cage with straps (matches physical sat build).",
      });
    } else {
      for (const n of power) {
        if (n.position[1] > 40) {
          n.position = [n.position[0], Math.min(n.position[1], 18), n.position[2]];
        }
      }
      notes.push({
        id: "power_low",
        rule: "Power sits low",
        nodeIds: power.map((n) => n.id),
        detail: "Battery and charge circuit stay near the base.",
      });
    }
  }

  // ── Rule: brain ──
  const brains = nodes.filter((n) => n.layer === "brain" || n.id === "brain");
  if (brains.length > 0) {
    if (isCubeSat) {
      for (const n of brains) {
        n.position = [cageC[0] - 12, cageC[1] - 6, cageC[2] + cageSize / 2 - 8];
      }
      notes.push({
        id: "brain_mid",
        rule: "Controller in cage",
        nodeIds: brains.map((n) => n.id),
        detail: "MCU sits inside the cube behind the OLED for short I2C runs.",
      });
    } else {
      const fy = faceY(nodes);
      for (const n of brains) {
        const mid = Math.max(48, Math.min(fy - 20, 70));
        n.position = [n.position[0], mid, Math.max(n.position[2], 10)];
      }
      notes.push({
        id: "brain_mid",
        rule: "Controller mid-structure",
        nodeIds: brains.map((n) => n.id),
        detail: "MCU placed mid-height for wiring reach.",
      });
    }
  }

  // ── Rule: touch on cube top ──
  const touches = nodes.filter((n) => n.layer === "touch" || n.id === "touch");
  if (touches.length > 0) {
    if (isCubeSat) {
      for (const n of touches) {
        n.position = [cageC[0], cageC[1] + cageSize / 2 + 1.2, cageC[2]];
      }
      notes.push({
        id: "touch_top",
        rule: "Controls on top",
        nodeIds: touches.map((n) => n.id),
        detail: "Touch pad sits on the top face of the wire cube.",
      });
    } else {
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

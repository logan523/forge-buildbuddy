/**
 * Sun direction — interactive light + optional solar re-aim.
 * Azimuth 0 = +Z (viewer), 90 = +X; elevation 0 = horizon, 90 = zenith.
 */
export interface SunState {
  /** Degrees, 0–360 */
  azimuth: number;
  /** Degrees, 5–85 */
  elevation: number;
  /** Intensity multiplier */
  intensity: number;
}

export const DEFAULT_SUN: SunState = {
  azimuth: 35,
  elevation: 55,
  intensity: 1.15,
};

/** Unit direction from origin toward the sun (Three.js Y-up). */
export function sunDirection(sun: SunState): [number, number, number] {
  const az = (sun.azimuth * Math.PI) / 180;
  const el = (sun.elevation * Math.PI) / 180;
  const cosEl = Math.cos(el);
  // azimuth 0 → +Z, 90 → +X
  const x = Math.sin(az) * cosEl;
  const y = Math.sin(el);
  const z = Math.cos(az) * cosEl;
  return [x, y, z];
}

/** Light position = direction * distance (far enough for directional feel). */
export function sunLightPosition(sun: SunState, distance = 6): [number, number, number] {
  const [x, y, z] = sunDirection(sun);
  return [x * distance, y * distance, z * distance];
}

/**
 * Pitch/yaw for a solar panel so its local +Z faces the sun.
 * Returns Euler XYZ radians.
 */
export function solarRotationTowardSun(
  sun: SunState,
  side: "left" | "right" | "center"
): [number, number, number] {
  const [sx, sy, sz] = sunDirection(sun);
  // Base aim: look at sun from panel
  const pitch = -Math.atan2(sy, Math.hypot(sx, sz)); // face up toward sun
  const yaw = Math.atan2(sx, sz);
  // Dihedral open wings
  const roll =
    side === "left" ? 0.35 : side === "right" ? -0.35 : 0;
  return [pitch, yaw * 0.35, roll];
}

export function sunLabel(sun: SunState): string {
  const dir =
    sun.azimuth < 45 || sun.azimuth >= 315
      ? "front"
      : sun.azimuth < 135
        ? "right"
        : sun.azimuth < 225
          ? "back"
          : "left";
  return `${Math.round(sun.elevation)}° ${dir}`;
}

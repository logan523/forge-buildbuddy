import type { BuildPlan } from "@/lib/types";
import { generatePcbPackage } from "@/lib/pcb";

export interface EnclosureParams {
  length: number; // mm inner board length + margin
  width: number;
  height: number;
  wall: number;
  standoff: number;
  usbCutout: boolean;
  oledWindow: boolean;
  ventSlots: boolean;
}

export interface EnclosurePackage {
  params: EnclosureParams;
  openscad: string;
  topSvg: string;
  sideSvg: string;
  notes: string[];
}

export function defaultEnclosureParams(plan: BuildPlan): EnclosureParams {
  let length = 90;
  let width = 60;
  try {
    const pcb = generatePcbPackage(plan);
    length = Math.ceil(pcb.boardWidth + 12);
    width = Math.ceil(pcb.boardHeight + 12);
  } catch {
    /* defaults */
  }
  const hasOled = (plan.parts || []).some(
    (p) => p.catalogId === "ssd1306-i2c" || /oled/i.test(p.name)
  );
  const hasEsp = (plan.parts || []).some(
    (p) => p.catalogId?.includes("esp32") || /esp32/i.test(p.name)
  );
  return {
    length: Math.max(50, length),
    width: Math.max(40, width),
    height: 22,
    wall: 2.2,
    standoff: 4,
    usbCutout: hasEsp,
    oledWindow: hasOled,
    ventSlots: true,
  };
}

export function generateOpenScad(p: EnclosureParams): string {
  return `// Forge parametric enclosure — open in OpenSCAD and render/export STL
// Board cavity ~ ${p.length - 2 * p.wall} x ${p.width - 2 * p.wall} mm

length = ${p.length};
width = ${p.width};
height = ${p.height};
wall = ${p.wall};
standoff_h = ${p.standoff};
standoff_r = 2.5;
hole_r = 1.2;

module shell() {
  difference() {
    cube([length, width, height]);
    translate([wall, wall, wall])
      cube([length - 2*wall, width - 2*wall, height]);
${p.usbCutout ? `    // USB-C cutout (front)
    translate([-0.1, width/2 - 5, wall + 2])
      cube([wall + 0.2, 10, 4]);
` : ""}${p.oledWindow ? `    // OLED window (top of lid — applied on lid module)
` : ""}${p.ventSlots ? `    // Side vents
    for (i = [0:4]) {
      translate([length - wall - 0.1, 12 + i*8, wall + 6])
        cube([wall + 0.2, 3, 2]);
    }
` : ""}  }
}

module standoffs() {
  positions = [
    [wall + 6, wall + 6],
    [length - wall - 6, wall + 6],
    [wall + 6, width - wall - 6],
    [length - wall - 6, width - wall - 6]
  ];
  for (pos = positions) {
    translate([pos[0], pos[1], wall])
      difference() {
        cylinder(h=standoff_h, r=standoff_r, $fn=24);
        translate([0,0,-0.1]) cylinder(h=standoff_h + 0.2, r=hole_r, $fn=16);
      }
  }
}

module base() {
  union() {
    shell();
    standoffs();
  }
}

module lid() {
  difference() {
    cube([length, width, wall + 1.5]);
    // Lip
    translate([wall/2, wall/2, -0.1])
      cube([length - wall, width - wall, 1]);
${p.oledWindow ? `    // OLED aperture
    translate([length/2 - 14, width/2 - 8, -0.1])
      cube([28, 16, wall + 2]);
` : ""}  }
}

// Layout for export: base at origin, lid to the side
base();
translate([length + 10, 0, 0]) lid();
`;
}

export function previewSvgs(p: EnclosureParams): { topSvg: string; sideSvg: string } {
  const s = 2;
  const topSvg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${p.length * s + 20}" height="${p.width * s + 40}" viewBox="0 0 ${p.length * s + 20} ${p.width * s + 40}">
  <rect x="10" y="10" width="${p.length * s}" height="${p.width * s}" fill="#f5f0e8" stroke="#1a2744" stroke-width="2" rx="4"/>
  <rect x="${10 + p.wall * s}" y="${10 + p.wall * s}" width="${(p.length - 2 * p.wall) * s}" height="${(p.width - 2 * p.wall) * s}" fill="none" stroke="#0891b2" stroke-dasharray="4 2"/>
  ${p.oledWindow ? `<rect x="${10 + (p.length / 2 - 14) * s}" y="${10 + (p.width / 2 - 8) * s}" width="${28 * s}" height="${16 * s}" fill="#0f172a" opacity="0.15" stroke="#0891b2"/>` : ""}
  <text x="10" y="${p.width * s + 30}" font-size="11" fill="#4a5568" font-family="monospace">${p.length}×${p.width} mm top</text>
</svg>`;

  const sideSvg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${p.length * s + 20}" height="${p.height * s + 40}" viewBox="0 0 ${p.length * s + 20} ${p.height * s + 40}">
  <rect x="10" y="10" width="${p.length * s}" height="${p.height * s}" fill="#e7e5e4" stroke="#1a2744" stroke-width="2"/>
  ${p.usbCutout ? `<rect x="10" y="${10 + (p.wall + 2) * s}" width="${4 * s}" height="${4 * s}" fill="#0f172a"/>` : ""}
  <text x="10" y="${p.height * s + 30}" font-size="11" fill="#4a5568" font-family="monospace">side h=${p.height}mm wall=${p.wall}mm</text>
</svg>`;

  return { topSvg, sideSvg };
}

export function generateEnclosure(plan: BuildPlan, override?: Partial<EnclosureParams>): EnclosurePackage {
  const params = { ...defaultEnclosureParams(plan), ...override };
  const openscad = generateOpenScad(params);
  const { topSvg, sideSvg } = previewSvgs(params);
  return {
    params,
    openscad,
    topSvg,
    sideSvg,
    notes: [
      "Wall thickness ≥2mm for FDM PLA/PETG.",
      "Verify USB cutout against your exact ESP32-C3 clone.",
      "Export STL from OpenSCAD (F6 → File → Export).",
      "Optional: Zoo/Forma STEP generation needs API keys (not configured).",
    ],
  };
}

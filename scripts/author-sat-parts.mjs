/**
 * Author the remaining sat_clock buyable modules as GLBs (body only — pins come
 * from the netlist overlay). One run writes all five. Frames match real-parts.ts.
 *
 * Run:  node scripts/author-sat-parts.mjs   (or: npm run models:sat-parts)
 * Out:  public/models/parts/{tp4056,cell_16340,sht30,ttp223,solar_cell}.glb
 */
import { THREE, std, pcbSlab, group, exportGlb } from "./lib/authoring.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/parts");

// ---- TP4056 micro-USB Li-ion charger (25×19, blue PCB) ------------------
function tp4056() {
  const { root, add } = group("TP4056");
  const T = 1.4, top = T / 2;
  root.add(pcbSlab(25, 19, T, std(0x1d3f9e, { roughness: 0.5 }), 1.4)); // classic blue
  // micro-USB on the −X short edge
  add(new THREE.BoxGeometry(5, 7.6, 2.6), std(0xcbd0d7, { metalness: 0.9, roughness: 0.26 }), -11.4, 0, top + 1.0);
  add(new THREE.BoxGeometry(2, 5, 1.4), std(0x090a0c, { roughness: 0.7 }), -13.2, 0, top + 1.0);
  // TP4056 IC (SOP-8) + current-set resistor
  add(new THREE.BoxGeometry(5, 4, 1.0), std(0x0b0c0f, { roughness: 0.38 }), 2.5, 0, top + 0.5);
  add(new THREE.BoxGeometry(2.2, 1.2, 0.6), std(0x1230a0, { roughness: 0.5 }), 7.5, 5.5, top + 0.3);
  // status LEDs — red (charging) + green (done)
  add(new THREE.BoxGeometry(1.7, 1.1, 0.7), std(0x120303, { emissive: 0xff2a2a, emissiveIntensity: 1.4 }), -5, 5.5, top + 0.35);
  add(new THREE.BoxGeometry(1.7, 1.1, 0.7), std(0x031205, { emissive: 0x22dd55, emissiveIntensity: 1.2 }), -5, -5.5, top + 0.35);
  // corner solder pads (copper rings; the wirable overlay pins ride on these)
  const copper = std(0xb9793f, { metalness: 0.55, roughness: 0.36 });
  for (const [x, y] of [[10, 7], [-10, 7], [10, -7], [-10, -7], [0, 7.5], [0, -7.5]]) {
    add(new THREE.CylinderGeometry(1.4, 1.4, 0.14, 16), copper, x, y, top + 0.02, Math.PI / 2);
  }
  return root;
}

// ---- 16340 Li-ion cell (Ø16.5 × 34, Y axis; + top, − bottom) -------------
function cell_16340() {
  const { root, add } = group("Cell16340");
  const R = 8.25, L = 34;
  const wrap = std(0x2b6cb0, { metalness: 0.35, roughness: 0.42 }); // blue wrap
  const steel = std(0xc8ccd2, { metalness: 0.85, roughness: 0.28 });
  add(new THREE.CylinderGeometry(R, R, L, 40), wrap); // body (Y axis)
  add(new THREE.CylinderGeometry(R * 0.99, R * 0.99, 6, 40), std(0xe8ecf1, { roughness: 0.5 }), 0, L * 0.12, 0); // label band
  // + button top
  add(new THREE.CylinderGeometry(R, R, 0.6, 40), steel, 0, L / 2 - 0.1, 0);
  add(new THREE.CylinderGeometry(4, 4, 1.4, 28), steel, 0, L / 2 + 0.6, 0);
  // − flat bottom
  add(new THREE.CylinderGeometry(R, R, 0.4, 40), steel, 0, -L / 2 + 0.1, 0);
  return root;
}

// ---- SHT30 temp/humidity breakout (16×16, purple PCB) --------------------
function sht30() {
  const { root, add } = group("SHT30");
  const T = 1.2, top = T / 2;
  root.add(pcbSlab(16, 16, T, std(0x3a1d6e, { roughness: 0.5 }), 1.2)); // purple breakout
  // sensor DFN with metal lid + vent slot
  add(new THREE.BoxGeometry(2.6, 2.6, 0.95), std(0xb8bcc4, { metalness: 0.7, roughness: 0.35 }), 0, 0.5, top + 0.45);
  add(new THREE.BoxGeometry(1.5, 0.4, 0.4), std(0x0a0a0c, { roughness: 0.6 }), 0, 0.5, top + 0.95);
  // decoupling passives
  add(new THREE.BoxGeometry(1.0, 0.6, 0.45), std(0xd7c9a0), -4.5, 3.5, top + 0.22);
  add(new THREE.BoxGeometry(1.0, 0.6, 0.45), std(0xd7c9a0), -4.5, -3.5, top + 0.22);
  return root;
}

// ---- TTP223 capacitive touch module (15×11) ------------------------------
function ttp223() {
  const { root, add } = group("TTP223");
  const T = 1.2, top = T / 2;
  root.add(pcbSlab(15, 11, T, std(0x17181f, { roughness: 0.5 }), 1.0)); // black board
  // TTP223 IC (SOT-23-6)
  add(new THREE.BoxGeometry(2.9, 1.6, 0.9), std(0x0b0c0f, { roughness: 0.38 }), 0, 2.5, top + 0.45);
  // touch sense pad (gold area — the bit you press); rx=π/2 lays the disk flat
  add(new THREE.CylinderGeometry(3.2, 3.2, 0.12, 28), std(0xd8b45c, { metalness: 0.82, roughness: 0.3 }), 0, -1, top + 0.12, Math.PI / 2);
  return root;
}

// ---- Solar panel 60×45 (monocrystalline cells via geometry, no texture) ---
function monoCellShape(size, cut) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + cut, -h);
  s.lineTo(h - cut, -h);
  s.lineTo(h, -h + cut);
  s.lineTo(h, h - cut);
  s.lineTo(h - cut, h);
  s.lineTo(-h + cut, h);
  s.lineTo(-h, h - cut);
  s.lineTo(-h, -h + cut);
  s.closePath();
  return s;
}
function solar_cell() {
  const { root, add } = group("SolarPanel");
  // epoxy/laminate substrate
  root.add(pcbSlab(60, 45, 2, std(0x0a1020, { roughness: 0.45 }), 1.5));
  const cellMat = std(0x0b1c3f, { metalness: 0.45, roughness: 0.4 }); // deep monocrystalline blue
  const bus = std(0xd7dbe0, { metalness: 0.75, roughness: 0.35 }); // silver bus bars
  const cellGeo = new THREE.ExtrudeGeometry(monoCellShape(16.5, 2.6), { depth: 0.5, bevelEnabled: false, steps: 1 });
  cellGeo.translate(0, 0, 1.0);
  // 3 cols × 2 rows of cut-corner cells
  for (let cx = -1; cx <= 1; cx++) {
    for (const cy of [-1, 1]) {
      const x = cx * 19;
      const y = cy * 11;
      const m = new THREE.Mesh(cellGeo, cellMat);
      m.position.set(x, y, 0);
      root.add(m);
      // 2 vertical bus fingers per cell
      add(new THREE.BoxGeometry(0.5, 15, 0.12), bus, x - 4, y, 1.55);
      add(new THREE.BoxGeometry(0.5, 15, 0.12), bus, x + 4, y, 1.55);
    }
  }
  // horizontal tab bars linking the two rows
  for (const cx of [-19, 0, 19]) add(new THREE.BoxGeometry(1.2, 22, 0.14), bus, cx, 0, 1.6);
  return root;
}

// ---- Export all ----------------------------------------------------------
await exportGlb(tp4056(), resolve(DIR, "tp4056.glb"), "tp4056");
await exportGlb(cell_16340(), resolve(DIR, "cell_16340.glb"), "cell_16340");
await exportGlb(sht30(), resolve(DIR, "sht30.glb"), "sht30");
await exportGlb(ttp223(), resolve(DIR, "ttp223.glb"), "ttp223");
await exportGlb(solar_cell(), resolve(DIR, "solar_cell.glb"), "solar_cell");

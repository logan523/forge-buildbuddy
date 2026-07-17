/**
 * ESP32-C3 SuperMini — authored part model (v2, author-kit edition).
 *
 * Recognition detail, all geometric (headless-safe): chamfered navy board,
 * USB-C receptacle, C3 SoC with leg fringe, copper PCB-antenna meander,
 * WS2812 status LED, BOOT/RST tactile buttons, two 7-pin gold header rows at
 * true 2.54mm pitch, extruded "ESP32-C3" silkscreen + pin-1 dot.
 *
 * Frame (must match real-parts.ts esp32_c3 so PinStub overlays + wire anchors
 * land): X = 22.5 long edge · Y = 18 short edge · Z thickness, +Z components ·
 * origin board center · USB toward -Y · headers inset at x = ±10.25.
 *
 * Run: npm run models:esp32c3   →  public/models/parts/esp32_c3.glb
 */
import * as THREE from "three";
import {
  MAT,
  chamferedBoard,
  exportGlb,
  icChip,
  led,
  passive,
  textLabel,
  usbC,
} from "./lib/author-kit.mjs";

const BOARD_L = 22.5;
const BOARD_W = 18.0;
const PCB_T = 1.2;
const TOP = PCB_T / 2;
const HDR_X = 10.25;
const PITCH = 2.54;

const root = new THREE.Group();
root.name = "ESP32C3_SuperMini_v2";
const put = (obj, x = 0, y = 0, z = 0) => {
  obj.position.set(x, y, z);
  root.add(obj);
  return obj;
};

// PCB
put(chamferedBoard(BOARD_L, BOARD_W, PCB_T, 1.4, MAT.pcbNavy()));

// USB-C on the -Y edge, mouth overhanging slightly
put(usbC({ w: 9, d: 7.2, h: 3.1 }), 0, -BOARD_W / 2 + 2.0, TOP + 1.45);

// ESP32-C3 SoC + support silicon
put(icChip({ w: 5, d: 5, h: 1.05 }), 0.6, 1.4, TOP + 0.55);
put(icChip({ w: 2.2, d: 2.2, h: 0.7, legs: false }), -4.2, -1.6, TOP + 0.35);
put(passive(), 4.8, 3.6, TOP + 0.22);
put(passive(), 4.8, 5.0, TOP + 0.22);
put(passive({ body: 0x333a45 }), -5.6, 0.6, TOP + 0.22);

// PCB antenna meander at +Y end
{
  const ay = BOARD_W / 2 - 2.9;
  put(new THREE.Mesh(new THREE.BoxGeometry(11, 4.4, 0.08), MAT.copper()), 0, ay, TOP + 0.14);
  for (let i = -1; i <= 1; i++) {
    put(new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.66, 0.18), MAT.copper()), 0, ay + i * 1.35, TOP + 0.26);
  }
}

// WS2812 status LED (part-detail: green glow spot lives here at runtime)
put(led(0xeef2f6, { w: 1.8, d: 1.8, h: 0.7 }), -4.5, 3.4, TOP + 0.35);

// BOOT + RST tactile buttons with steel caps
for (const bx of [-6.5, 6.5]) {
  put(new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 0.9), MAT.plastic()), bx, -4.6, TOP + 0.45);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 14), MAT.steel());
  cap.rotation.x = Math.PI / 2;
  put(cap, bx, -4.6, TOP + 1.05);
}
root.add(textLabel("BOOT", { size: 0.7, x: -6.5, y: -6.6, z: TOP + 0.16 }));
root.add(textLabel("RST", { size: 0.7, x: 6.5, y: -6.6, z: TOP + 0.16 }));

// Header rows: 7 gold pins each side at true pitch, black base, pin-1 dot
for (const sx of [-HDR_X, HDR_X]) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.3, 6 * PITCH + 2.2, 1.0), MAT.plastic());
  put(base, sx, 0, TOP + 0.3);
  for (let i = -3; i <= 3; i++) {
    put(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 1.35), MAT.gold()), sx, i * PITCH, TOP + 0.5);
  }
}
{
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 10), MAT.silk());
  dot.rotation.x = Math.PI / 2;
  put(dot, -HDR_X + 1.8, 3 * PITCH, TOP + 0.18);
}

// Silkscreen
root.add(textLabel("ESP32-C3", { size: 1.3, x: 0, y: -2.9, z: TOP + 0.16 }));

const { size } = await exportGlb(root, "esp32_c3.glb");
if (size.x < 21 || size.x > 24.5 || size.y < 17 || size.y > 21) {
  throw new Error(`esp32_c3 bbox out of family: ${size.x}×${size.y}`);
}

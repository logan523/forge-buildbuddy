import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  REAL_PARTS,
  deriveCageEdgeMm,
  boardGeomParams,
  cellGeomParams,
  cellRadiusMm,
  catalogDefaultSize,
  realPartForNodeId,
} from "./real-parts";
import { CATALOG, readyCatalogAssetPaths, applyCatalogHints } from "./catalog";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("real-parts dimension authority", () => {
  it("locks SuperMini / 16340 / OLED class footprints", () => {
    assert.ok(REAL_PARTS.esp32_c3.bboxMm.l <= 26);
    assert.ok(REAL_PARTS.esp32_c3.bboxMm.w <= 20);
    assert.equal(cellRadiusMm(), 8.25);
    assert.equal(REAL_PARTS.cell_16340.bboxMm.l, 34);
    assert.equal(REAL_PARTS.oled_096.bboxMm.l, 27);
    assert.equal(REAL_PARTS.oled_096.bboxMm.w, 27);
  });

  it("deriveCageEdgeMm fits cell and stays life-size", () => {
    const cage = deriveCageEdgeMm();
    assert.ok(cage >= 46, `cage ${cage}`);
    assert.ok(cage <= 58, `cage ${cage} too large`);
    assert.ok(cage >= REAL_PARTS.cell_16340.bboxMm.l, "cage ≥ cell length");
  });

  it("catalog defaultSize matches RealPartSpec", () => {
    for (const id of Object.keys(REAL_PARTS) as (keyof typeof REAL_PARTS)[]) {
      const c = CATALOG[id];
      const d = catalogDefaultSize(REAL_PARTS[id]);
      assert.deepEqual(c.defaultSize, d, id);
    }
  });

  it("boardGeomParams maps l/w/h → width/height/depth", () => {
    const g = boardGeomParams(REAL_PARTS.esp32_c3);
    assert.equal(g.width, 22.5);
    assert.equal(g.height, 18);
    assert.equal(g.depth, 3.2);
  });

  it("cellGeomParams is true 16340", () => {
    const g = cellGeomParams();
    assert.equal(g.radius, 8.25);
    assert.equal(g.height, 34);
  });

  it("realPartForNodeId maps sat roles", () => {
    assert.equal(realPartForNodeId("brain")?.id, "esp32_c3");
    assert.equal(realPartForNodeId("face")?.id, "oled_096");
    assert.equal(realPartForNodeId("battery")?.id, "cell_16340");
  });

  it("build-scene life layout does not size OLED from cage * ratio", () => {
    const src = readFileSync(join(__dirname, "build-scene.ts"), "utf8");
    // Life path must not use proportional electronics sizing
    assert.ok(!/oledW\s*=\s*cage\s*\*/.test(src), "no oledW = cage *");
    assert.ok(!/oledH\s*=\s*cage\s*\*/.test(src), "no oledH = cage *");
    assert.ok(!/wingW\s*=\s*cage\s*\*/.test(src), "no wingW = cage *");
    assert.ok(!/height:\s*cage\s*\*/.test(src), "no cell height = cage *");
    assert.ok(src.includes("REAL_PARTS"), "uses RealPartSpec");
    assert.ok(src.includes("deriveCageEdgeMm"), "cage from contents");
  });

  it("Phase 3 GLB files exist on disk; legacy real-parts glbReady stays off", () => {
    const ids = [
      "esp32_c3",
      "oled_096",
      "tp4056",
      "cell_16340",
      "sht30",
      "ttp223",
      "solar_cell",
    ] as const;
    for (const id of ids) {
      // Legacy gate: the crude auto-GLB path stays off. Real/authored models are
      // switched on separately via the open PART_MODELS registry (see below).
      assert.equal(REAL_PARTS[id].mesh.glbReady, false, `${id} glbReady default off`);
      assert.equal(CATALOG[id].assetReady, false, `${id} assetReady default off`);
      const file = join(process.cwd(), "public", "models", "parts", `${id}.glb`);
      assert.ok(existsSync(file), `missing ${file}`);
      const buf = readFileSync(file);
      assert.equal(buf.toString("utf8", 0, 4), "glTF", `${id} magic`);
      assert.ok(buf.length > 500, `${id} non-empty`);
    }
    // Authored models are live via the open registry; the rest stay parametric.
    const ready = readyCatalogAssetPaths();
    assert.ok(ready.includes("/models/parts/esp32_c3.glb"), "esp32 live");
    assert.ok(ready.includes("/models/parts/oled_096.glb"), "oled live");
  });

  it("applyCatalogHints attaches a GLB only where an open-registry model is ready", () => {
    // ESP32-C3: authored model is live → assetUrl attached, parametric bypassed.
    const [brain] = applyCatalogHints([
      {
        id: "brain",
        layer: "brain",
        label: "ESP",
        geom: { kind: "pcb_module", params: { width: 22.5, height: 18, depth: 3.2 } },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        material: { color: "#14532d" },
      },
    ]);
    assert.equal(brain!.catalogId, "esp32_c3");
    assert.equal(brain!.assetUrl, "/models/parts/esp32_c3.glb");

    // Unrecognized board → generic_pcb has no model → no assetUrl, parametric fallback.
    const [proto] = applyCatalogHints([
      {
        id: "proto",
        layer: "brain",
        label: "Proto board",
        geom: { kind: "board", params: { width: 30, height: 20, depth: 2 } },
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        material: { color: "#0f172a" },
      },
    ]);
    assert.equal(proto!.catalogId, "generic_pcb");
    assert.equal(proto!.assetUrl, undefined);
  });
});

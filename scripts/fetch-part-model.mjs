/**
 * Real-component 3D model fetcher — the Track B bake-off pipeline.
 *
 * Proves the eng-review question: can we get a REAL manufacturer model cheaply,
 * with NO CAD toolchain (no FreeCAD/Blender/STEP)? Yes — EasyEDA serves a raw
 * OBJ per LCSC part; obj2gltf converts it to GLB. This whole script is one
 * network fetch + one npx call.
 *
 * Usage:
 *   node scripts/fetch-part-model.mjs C2934569 esp32c3_real
 *   (LCSC C-number, output basename → public/models/parts/<name>.glb)
 *
 * Findings from the ESP32-C3 bake-off (2026-07-10):
 * - The exact hero SKU (ESP32-C3 "SuperMini" dev board) has NO clean EasyEDA
 *   model — commodity clone. Closest real part is the ESP32-C3-MINI-1 MODULE
 *   (C2934569): a 13.2×16.6mm bare module, NOT the 22.5×18mm dev board Forge
 *   renders. So even the "real" model is the wrong form factor.
 * - EasyEDA OBJs use inline `newmtl` blocks (non-standard) and `d 0.0` for
 *   OPAQUE parts (inverted) — must rewrite to `d 1.0` or the mesh renders
 *   invisible. This script handles both.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/models/parts");
const TMP = join(ROOT, "node_modules/.cache/part-models");

const lcsc = process.argv[2];
const name = process.argv[3];
if (!lcsc || !name) {
  console.error("usage: node scripts/fetch-part-model.mjs <LCSC-C-number> <output-basename>");
  process.exit(1);
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Resolve the 3D-model UUID from the component's footprint SVGNODE.
  const comp = await (
    await fetch(`https://easyeda.com/api/products/${lcsc}/components?version=6.4.19.5`)
  ).json();
  const shapes = comp?.result?.packageDetail?.dataStr?.shape || [];
  const svgnode = shapes.find((s) => typeof s === "string" && s.startsWith("SVGNODE"));
  const uuid = svgnode && JSON.parse(svgnode.slice(svgnode.indexOf("~") + 1))?.attrs?.uuid;
  if (!uuid) throw new Error(`no 3D model UUID for ${lcsc} (part may have no model)`);
  console.log(`${lcsc} → model uuid ${uuid}`);

  // 2. Fetch the raw OBJ (EasyEDA inlines the MTL).
  const objRaw = await (await fetch(`https://modules.easyeda.com/3dmodel/${uuid}`)).text();
  if (!objRaw.startsWith("v ")) throw new Error("model endpoint did not return an OBJ");

  // 3. Split inline materials into a real .mtl; fix inverted `d`.
  const mtl = ["# extracted from EasyEDA inline defs"];
  const obj = ["mtllib model.mtl"];
  let inMtl = false;
  for (const ln of objRaw.split(/\r?\n/)) {
    const s = ln.trim();
    if (s.startsWith("newmtl")) { inMtl = true; mtl.push(ln); continue; }
    if (inMtl) {
      if (s.startsWith("d ") || s.startsWith("Tr")) { mtl.push("d 1.0"); continue; }
      if (s.startsWith("endmtl")) { inMtl = false; mtl.push("illum 2"); continue; }
      mtl.push(ln); continue;
    }
    obj.push(ln);
  }
  writeFileSync(join(TMP, "model.mtl"), mtl.join("\n") + "\n");
  writeFileSync(join(TMP, "model.obj"), obj.join("\n") + "\n");

  // 4. OBJ → GLB (no CAD kernel needed).
  execFileSync(
    "npx",
    ["-y", "obj2gltf@3", "-i", join(TMP, "model.obj"), "-o", join(OUT_DIR, `${name}.glb`), "--binary"],
    { stdio: "inherit" }
  );
  console.log(`\n✓ wrote public/models/parts/${name}.glb`);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});

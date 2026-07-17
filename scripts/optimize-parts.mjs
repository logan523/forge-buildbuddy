/**
 * Optimize authored part GLBs in place — weld + quantize + prune + dedup.
 *
 * Quantization (KHR_mesh_quantization) is decoded natively by three's
 * GLTFLoader — no extra runtime decoder — and typically cuts these
 * geometry-only models 60–80% (extruded silkscreen text is vertex-heavy).
 *
 * Run after any author-*.mjs:  npm run models:optimize
 */
import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, prune, quantize, weld } from "@gltf-transform/functions";
import { readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/parts");
const io = new NodeIO().registerExtensions([KHRMeshQuantization]);

const files = readdirSync(dir).filter((f) => f.endsWith(".glb"));
for (const f of files) {
  const path = resolve(dir, f);
  const before = statSync(path).size;
  const doc = await io.read(path);
  await doc.transform(weld(), quantize(), dedup(), prune());
  await io.write(path, doc);
  const after = statSync(path).size;
  const pct = Math.round((1 - after / before) * 100);
  console.log(`${f}: ${before} → ${after} bytes (−${pct}%)`);
}

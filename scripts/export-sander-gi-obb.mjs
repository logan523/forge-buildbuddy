#!/usr/bin/env node
/**
 * Download SanderGi PCB-OBB weights and export ONNX for browser AR.
 *
 * Requires: python3 + venv with ultralytics, onnx
 *   python3 -m venv /tmp/forge-sander-gi/.venv
 *   . /tmp/forge-sander-gi/.venv/bin/activate
 *   pip install ultralytics onnx
 *
 * Or run with FORGE_SANDER_PYTHON=/path/to/venv/bin/python
 *
 * Output: public/models/ar/sander-gi-pcb-obb.onnx
 * Source: https://github.com/SanderGi/PCB-Detection (MIT)
 * Weights: https://huggingface.co/SanderGi/PCB-OBB
 */

import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const outDir = join(root, "public/models/ar");
const outOnnx = join(outDir, "sander-gi-pcb-obb.onnx");
const PT_URL = "https://huggingface.co/SanderGi/PCB-OBB/resolve/main/best.pt";

mkdirSync(outDir, { recursive: true });

const work = "/tmp/forge-sander-gi-export";
mkdirSync(work, { recursive: true });
const ptPath = join(work, "best.pt");

async function download(url, dest) {
  console.log("Downloading", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log("Saved", dest, readFileSync(dest).length, "bytes");
}

if (!existsSync(ptPath) || readFileSync(ptPath).length < 1_000_000) {
  await download(PT_URL, ptPath);
}

const py =
  process.env.FORGE_SANDER_PYTHON ||
  (existsSync("/tmp/forge-sander-gi/.venv/bin/python")
    ? "/tmp/forge-sander-gi/.venv/bin/python"
    : "python3");

const exportPy = `
from ultralytics import YOLO
m = YOLO(${JSON.stringify(ptPath)}, task="obb")
path = m.export(format="onnx", imgsz=640, simplify=True, opset=12)
print(path)
`;

console.log("Exporting ONNX with", py);
const r = spawnSync(py, ["-c", exportPy], { encoding: "utf8", cwd: work });
if (r.status !== 0) {
  console.error(r.stdout, r.stderr);
  console.error(`
Failed. Create a venv and install deps:
  python3 -m venv /tmp/forge-sander-gi/.venv
  /tmp/forge-sander-gi/.venv/bin/pip install ultralytics onnx
  FORGE_SANDER_PYTHON=/tmp/forge-sander-gi/.venv/bin/python node scripts/export-sander-gi-obb.mjs
`);
  process.exit(1);
}
const lines = (r.stdout || "").trim().split("\n");
const onnxSrc = lines[lines.length - 1].trim();
console.log("ONNX at", onnxSrc);
copyFileSync(onnxSrc, outOnnx);
const buf = readFileSync(outOnnx);
const sha = createHash("sha256").update(buf).digest("hex");
console.log("Wrote", outOnnx, buf.length, "sha256", sha);

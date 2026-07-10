/**
 * E3 photo-check eval harness — the gate that controls whether the
 * "Did I do it right?" button exists at all (Tension C).
 *
 * Run: npx tsx scripts/eval-photo-check.mjs        (needs ANTHROPIC_API_KEY)
 *
 * PASS  → writes public/photo-check.pass.json  → the button renders.
 * FAIL  → DELETES that file                     → the button disappears.
 *
 * Pass bar (founder-approved): ZERO false-"looks_right" on miswired fixtures.
 * Fixture-set requirements: ≥20 photos, ≥8 deliberately miswired, ≥2 devices.
 * Kill criteria: eval failure after one fixture-set revision, OR one confirmed
 * field false-"looks_right" → delete the pass file and leave the feature OFF.
 */

import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  PHOTO_CHECK_SYSTEM,
  buildPhotoCheckUser,
  parsePhotoVerdict,
} from "../src/lib/photo-check.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = path.join(ROOT, "fixtures", "photo-eval");
const MANIFEST = path.join(FIXTURES_DIR, "manifest.json");
const PASS_FILE = path.join(ROOT, "public", "photo-check.pass.json");

function fail(reason) {
  rmSync(PASS_FILE, { force: true });
  console.error(`\n✗ EVAL FAILED — ${reason}`);
  console.error("  public/photo-check.pass.json removed → the photo-check button is OFF.");
  console.error("  See fixtures/photo-eval/README.md for the fixture requirements.");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) fail("ANTHROPIC_API_KEY is not set.");
if (!existsSync(MANIFEST)) {
  fail(
    "no fixtures yet. Photograph your own build (correct AND deliberately miswired), " +
      "then describe each photo in fixtures/photo-eval/manifest.json."
  );
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const fixtures = manifest.fixtures ?? [];
const miswired = fixtures.filter((f) => f.label === "miswired");
const devices = new Set(fixtures.map((f) => f.device).filter(Boolean));

if (fixtures.length < 20) fail(`need ≥20 fixtures, have ${fixtures.length}.`);
if (miswired.length < 8) fail(`need ≥8 miswired fixtures, have ${miswired.length}.`);
if (devices.size < 2) fail(`need photos from ≥2 devices/lighting setups, have ${devices.size}.`);

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function judge(fixture) {
  const img = readFileSync(path.join(FIXTURES_DIR, fixture.file)).toString("base64");
  const facts = fixture.facts ?? manifest.facts ?? {};
  const images = [];
  if (fixture.reference) {
    images.push({
      data: readFileSync(path.join(FIXTURES_DIR, fixture.reference)).toString("base64"),
      mediaType: "image/jpeg",
    });
  }
  images.push({ data: img, mediaType: fixture.mediaType ?? "image/jpeg" });

  const user = buildPhotoCheckUser({
    stepTitle: facts.stepTitle,
    connections: facts.connections,
    checks: facts.checks,
    hasReference: images.length === 2,
  });

  const response = await client.messages.create(
    {
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      temperature: 0,
      system: PHOTO_CHECK_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((i) => ({
              type: "image",
              source: { type: "base64", media_type: i.mediaType, data: i.data },
            })),
            { type: "text", text: user },
          ],
        },
      ],
    },
    { timeout: 60_000 }
  );
  const content = response.content[0];
  return parsePhotoVerdict(content?.type === "text" ? content.text : "");
}

console.log(`Evaluating ${fixtures.length} fixtures (${miswired.length} miswired, ${devices.size} devices)…\n`);

const rows = [];
for (const f of fixtures) {
  try {
    const v = await judge(f);
    rows.push({ ...f, got: v.verdict, detail: v.detail });
    const mark =
      f.label === "miswired" && v.verdict === "looks_right"
        ? "✗ FALSE-PASS"
        : f.label === "miswired" && v.verdict !== "looks_right"
          ? "✓"
          : f.label === "correct" && v.verdict === "looks_right"
            ? "✓"
            : "·";
    console.log(`${mark.padEnd(13)} ${f.label.padEnd(9)} ${f.file.padEnd(30)} → ${v.verdict}  ${v.detail.slice(0, 70)}`);
  } catch (e) {
    rows.push({ ...f, got: "ERROR", detail: String(e) });
    console.log(`! ERROR       ${f.label.padEnd(9)} ${f.file.padEnd(30)} → ${String(e).slice(0, 80)}`);
  }
}

const falsePass = rows.filter((r) => r.label === "miswired" && r.got === "looks_right");
const errors = rows.filter((r) => r.got === "ERROR");
const correctRows = rows.filter((r) => r.label === "correct");
const usefulRate = correctRows.length
  ? correctRows.filter((r) => r.got === "looks_right").length / correctRows.length
  : 0;

console.log(`\n— ${falsePass.length} false-"looks_right" on miswired · ${errors.length} errors · looks_right on correct: ${Math.round(usefulRate * 100)}%`);

if (errors.length > 0) fail(`${errors.length} fixture(s) errored — rerun after fixing.`);
if (falsePass.length > 0) {
  falsePass.forEach((r) => console.error(`  FALSE-PASS: ${r.file} (${r.note ?? "no note"})`));
  fail(`${falsePass.length} miswired fixture(s) judged "looks_right" — the one unacceptable outcome.`);
}

if (usefulRate < 0.5) {
  console.warn(
    `\n⚠ Only ${Math.round(usefulRate * 100)}% of CORRECT fixtures got "looks_right" — the checker passes the safety bar but abstains so often it may not be useful. Consider better-lit fixtures before shipping.`
  );
}

writeFileSync(
  PASS_FILE,
  JSON.stringify(
    {
      passed: true,
      passedAt: new Date().toISOString(),
      fixtures: fixtures.length,
      miswired: miswired.length,
      devices: devices.size,
      falseLooksRight: 0,
      looksRightOnCorrectPct: Math.round(usefulRate * 100),
    },
    null,
    2
  ) + "\n"
);
console.log(`\n✓ EVAL PASSED — wrote public/photo-check.pass.json → the photo-check button is ON.`);
console.log(`  Kill criteria reminder: one confirmed field false-"looks_right" → delete that file.`);

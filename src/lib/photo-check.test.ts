import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  parsePhotoVerdict,
  handlePhotoCheck,
  PHOTO_CHECK_ABSTAIN,
  type PhotoCheckImage,
} from "./photo-check";
import { _resetApiGuards } from "./api-guards";

beforeEach(() => {
  _resetApiGuards();
  delete process.env.PHOTO_CHECK_DAILY_CAP;
});

// --- parser: constrained three-shape contract, abstain on anything else ---

test("parser passes through all three legal verdicts", () => {
  assert.equal(
    parsePhotoVerdict('{"verdict":"looks_right","detail":"All four wires match."}').verdict,
    "looks_right"
  );
  assert.equal(
    parsePhotoVerdict('{"verdict":"cant_tell","detail":"Can\'t see SDA — check it manually."}').verdict,
    "cant_tell"
  );
  const issue = parsePhotoVerdict('{"verdict":"issue","detail":"Yellow wire lands on SDA, not SCL."}');
  assert.equal(issue.verdict, "issue");
  assert.match(issue.detail, /SDA/);
});

test("parser abstains on garbage, prose, and out-of-enum verdicts — never invents confidence", () => {
  assert.deepEqual(parsePhotoVerdict("The wiring looks great!"), PHOTO_CHECK_ABSTAIN);
  assert.deepEqual(parsePhotoVerdict('{"verdict":"perfect","detail":"nice"}'), PHOTO_CHECK_ABSTAIN);
  assert.deepEqual(parsePhotoVerdict(""), PHOTO_CHECK_ABSTAIN);
  assert.deepEqual(parsePhotoVerdict('{"broken json'), PHOTO_CHECK_ABSTAIN);
});

test("parser extracts JSON out of fences/prose wrapping", () => {
  const r = parsePhotoVerdict('Here you go:\n```json\n{"verdict":"cant_tell","detail":"Blurry — check the GND wire manually."}\n```');
  assert.equal(r.verdict, "cant_tell");
  assert.match(r.detail, /GND/);
});

// --- route core ---

const IMG = "aGVsbG8="; // tiny base64
const visionOk =
  (reply: string) =>
  async (_s: string, _u: string, _i: PhotoCheckImage[]) =>
    reply;

test("400 when no photo arrives", async () => {
  const r = await handlePhotoCheck({}, "ip", visionOk("{}"));
  assert.equal(r.status, 400);
});

test("413 when the payload blows the image budget", async () => {
  const r = await handlePhotoCheck(
    { imageBase64: "x".repeat(4_000_001) },
    "ip",
    visionOk("{}")
  );
  assert.equal(r.status, 413);
});

test("200: reference image goes FIRST, prompt labels both images and carries the facts", async () => {
  let gotUser = "";
  let gotImages: PhotoCheckImage[] = [];
  const r = await handlePhotoCheck(
    {
      imageBase64: IMG,
      referenceBase64: "cmVm",
      stepTitle: "Wire the display",
      connections: [
        { colorName: "blue", fromLabel: "ESP32-C3", fromPin: "GPIO4", toLabel: "OLED", toPin: "SDA" },
      ],
    },
    "ip",
    async (_s, user, images) => {
      gotUser = user;
      gotImages = images;
      return '{"verdict":"cant_tell","detail":"Angle hides SDA — check it manually."}';
    }
  );
  assert.equal(r.status, 200);
  assert.equal(gotImages.length, 2);
  assert.equal(gotImages[0].data, "cmVm", "reference first");
  assert.equal(gotImages[1].data, IMG);
  assert.match(gotUser, /Image 1 is the REFERENCE/);
  assert.ok(gotUser.includes("blue wire: ESP32-C3 pin GPIO4 → OLED pin SDA"));
});

test("unparseable model output → 200 abstain (a valid answer), not an error", async () => {
  const r = await handlePhotoCheck({ imageBase64: IMG }, "ip", visionOk("looks fine to me!"));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, PHOTO_CHECK_ABSTAIN);
});

test("502 fail-closed to the manual checklist when the vision call throws", async () => {
  const r = await handlePhotoCheck({ imageBase64: IMG }, "ip", async () => {
    throw new Error("api down");
  });
  assert.equal(r.status, 502);
  assert.ok("fallback" in r.body && r.body.fallback === "manual");
});

test("429 when the photo-check daily cap is exhausted", async () => {
  process.env.PHOTO_CHECK_DAILY_CAP = "1";
  const ok = await handlePhotoCheck({ imageBase64: IMG }, "a", visionOk('{"verdict":"cant_tell","detail":"x"}'));
  assert.equal(ok.status, 200);
  const capped = await handlePhotoCheck({ imageBase64: IMG }, "b", visionOk("{}"));
  assert.equal(capped.status, 429);
});

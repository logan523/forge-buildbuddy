import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, cleanup } from "@testing-library/react";
import { DisplayPreview } from "./display-preview";
import type { CustomFirmwareSource } from "@/lib/types";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SKETCH_DIR = path.join(ROOT, "scripts", "firmware-src", "weather-clock");

afterEach(cleanup);

function realWeatherClockFirmware(): CustomFirmwareSource {
  const names = ["weather-clock.ino", "bitmaps.h", "mars-and-back.h", "world-map.h"];
  return {
    id: "solar-weather-clock",
    label: "Solar Weather Clock firmware",
    boardFamily: "esp32c3",
    entryFile: "weather-clock.ino",
    files: names.map((name) => ({
      path: name,
      contents: readFileSync(path.join(SKETCH_DIR, name), "utf8"),
      kind: name.endsWith(".ino") ? "sketch" : "header",
    })),
    authoredBy: "human",
  };
}

test("DisplayPreview renders a canvas + label for each real bitmap frame extracted from the actual firmware source", () => {
  render(<DisplayPreview customFirmware={realWeatherClockFirmware()} />);
  // heart_f0..f3 (4 frames) live in bitmaps.h and resolve their dimension
  // via a real drawBitmap() call in mars-and-back.h.
  assert.ok(screen.getByText("heart_f0"));
  assert.ok(screen.getByText("heart_f1"));
  assert.ok(screen.getByText("heart_f2"));
  assert.ok(screen.getByText("heart_f3"));
  assert.ok(screen.getAllByText(/16×16/).length >= 4, "at least the 4 heart frames report a real 16x16");
  // earth_globe_f0 (one of 8 rotation frames, all 52x52) resolves via
  // world-map.h's EARTH_GLOBE_D #define.
  assert.ok(screen.getByText("earth_globe_f0"));
  assert.ok(screen.getAllByText(/52×52/).length >= 1);
});

test("DisplayPreview states the honest static-only scope in its own copy", () => {
  render(<DisplayPreview customFirmware={realWeatherClockFirmware()} />);
  assert.ok(screen.getByText(/not when or in what sequence/i));
  assert.ok(screen.getByText(/flash to a real board to see it live/i));
});

test("DisplayPreview: no PROGMEM arrays at all renders the honest empty state, not a blank gallery", () => {
  const empty: CustomFirmwareSource = {
    id: "x",
    label: "x",
    boardFamily: "esp32c3",
    entryFile: "x.ino",
    files: [{ path: "x.ino", contents: "void setup() {}\nvoid loop() {}\n", kind: "sketch" }],
    authoredBy: "human",
  };
  render(<DisplayPreview customFirmware={empty} />);
  assert.ok(screen.getByText(/no display assets found/i));
});

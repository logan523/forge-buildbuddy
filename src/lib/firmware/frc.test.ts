import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFrc, runFrcOnFiles } from "./frc";
import { generateFirmware } from "../firmware";
import { applyTrustPipeline } from "../trust";
import type { BuildPlan } from "../types";
import demo from "@/data/sat-line.json";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// --- Rule NET_SETUP_NO_RETRY -------------------------------------------------

test("NET_SETUP_NO_RETRY: a connect call in setup() with no retry anywhere in loop() is flagged", () => {
  const source = `
    void setup() {
      Serial.begin(115200);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    void loop() {
      display.println("hello");
      display.display();
    }
  `;
  const report = runFrc(source);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].rule, "NET_SETUP_NO_RETRY");
  assert.equal(report.clean, true, "a warning-only report is still 'clean' (no errors)");
});

test("NET_SETUP_NO_RETRY: a retry call anywhere in loop() clears the warning", () => {
  const source = `
    void setup() {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    void loop() {
      if (WiFi.status() != WL_CONNECTED) {
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      }
    }
  `;
  assert.deepEqual(runFrc(source).warnings, []);
});

test("NET_SETUP_NO_RETRY: a different retry API (wifiMulti.run) in loop() also clears it", () => {
  const source = `
    void setup() {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    void loop() {
      if (WiFi.status() != WL_CONNECTED) wifiMulti.run();
    }
  `;
  assert.deepEqual(runFrc(source).warnings, []);
});

test("NET_SETUP_NO_RETRY: no connect call in setup() at all — nothing to flag", () => {
  const source = `
    void setup() { Serial.begin(115200); }
    void loop() { Serial.println("running"); }
  `;
  assert.deepEqual(runFrc(source).warnings, []);
});

test("NET_SETUP_NO_RETRY: no setup()/loop() found at all (a header file, not a sketch) — no crash, nothing to flag", () => {
  const source = `void drawHeart(int frame) { /* ... */ }`;
  assert.deepEqual(runFrc(source), { errors: [], warnings: [], infos: [], clean: true });
});

// --- Rule LOOP_BLOCKING_WHILE_NO_TIMEOUT -------------------------------------

// Every fixture below also retries in loop() so NET_SETUP_NO_RETRY never
// fires alongside it — isolating exactly the rule under test.

test("LOOP_BLOCKING_WHILE_NO_TIMEOUT: an unbounded status-check while loop is flagged", () => {
  const source = `
    void setup() {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      while (WiFi.status() != WL_CONNECTED) {
        delay(250);
      }
    }
    void loop() {
      if (WiFi.status() != WL_CONNECTED) WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  `;
  const report = runFrc(source);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].rule, "LOOP_BLOCKING_WHILE_NO_TIMEOUT");
  assert.ok(report.warnings[0].line && report.warnings[0].line > 0);
});

test("LOOP_BLOCKING_WHILE_NO_TIMEOUT: a millis()-bounded wait is not flagged", () => {
  const source = `
    void setup() {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      unsigned long deadline = millis() + 15000UL;
      while (WiFi.status() != WL_CONNECTED && millis() < deadline) {
        delay(250);
      }
    }
    void loop() {
      if (WiFi.status() != WL_CONNECTED) WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  `;
  assert.deepEqual(runFrc(source).warnings, []);
});

test("LOOP_BLOCKING_WHILE_NO_TIMEOUT: a while loop unrelated to connection status is not flagged", () => {
  const source = `
    void setup() {}
    void loop() {
      while (Serial.available()) { Serial.read(); }
    }
  `;
  assert.deepEqual(runFrc(source).warnings, []);
});

test("LOOP_BLOCKING_WHILE_NO_TIMEOUT: a generic client.connected() idiom (with its own inner parens) is still correctly matched, not broken by nested parens", () => {
  const source = `
    void setup() {
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      while (!client.connected()) {
        delay(500);
      }
    }
    void loop() {
      if (WiFi.status() != WL_CONNECTED) WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
  `;
  const report = runFrc(source);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].rule, "LOOP_BLOCKING_WHILE_NO_TIMEOUT");
});

// --- Clean-sketch negative case ----------------------------------------------

test("a clean sketch with neither pattern reports nothing", () => {
  const source = `
    void setup() {
      Serial.begin(115200);
      pinMode(LED_PIN, OUTPUT);
    }
    void loop() {
      digitalWrite(LED_PIN, HIGH);
      delay(500);
      digitalWrite(LED_PIN, LOW);
      delay(500);
    }
  `;
  assert.deepEqual(runFrc(source), { errors: [], warnings: [], infos: [], clean: true });
});

// --- Real sketches: the actual fix (positive) vs. the actual live bug (negative) ---

test("runFrcOnFiles: the real, fixed weather-clock.ino comes back clean — proves the rule against the reference shape it's modeled on", () => {
  const inoPath = path.join(ROOT, "scripts", "firmware-src", "weather-clock", "weather-clock.ino");
  const contents = readFileSync(inoPath, "utf8");
  const report = runFrcOnFiles([{ name: "weather-clock.ino", contents }]);
  assert.deepEqual(report.warnings, [], "the shipped Wi-Fi watchdog fix must satisfy NET_SETUP_NO_RETRY");
});

test("runFrcOnFiles: Forge's OWN generated full_app template comes back clean, after fixing the same live bug shape FRC was built to catch", () => {
  // Running this rule against firmware.ts's own generated output (before
  // any fix) found the exact bug shape this whole rule is modeled on,
  // already shipping — not just in the hand-authored sketch that motivated
  // it: WiFi.begin() called once in setup(), no retry anywhere in loop().
  // That got fixed directly (see firmware.ts's g_lastWifiRetry watchdog,
  // ~line 622) as proof the rule catches something real. This test guards
  // the fix, not the bug.
  const plan = applyTrustPipeline(demo as unknown as BuildPlan);
  const fw = generateFirmware(plan)!;
  const app = fw.sketches.find((s) => s.id === "full_app")!;
  assert.match(app.code, /WiFi\.begin\(/, "sanity check: this generated sketch does call WiFi.begin() in setup()");
  assert.match(app.code, /g_lastWifiRetry/, "sanity check: the retry watchdog is actually present in generated code");
  const report = runFrcOnFiles([{ name: "full_app.ino", contents: app.code }]);
  assert.deepEqual(report.warnings, []);
});

import type { BuildPlan, Part, WiringConnection } from "./types";
import { getModuleById } from "./catalog";
import { stepKind } from "./steps/classify";

export interface FirmwareSketch {
  id: string;
  name: string;
  description: string;
  filename: string;
  code: string;
  libraries: string[];
  /** When to show this sketch prominently */
  phase: "smoke" | "bus" | "subsystem" | "app";
}

export interface FirmwarePackage {
  boardId: string;
  boardLabel: string;
  /** Arduino IDE board menu hint */
  arduinoBoard: string;
  pinMap: Record<string, number | string>;
  pinDefines: string;
  sketches: FirmwareSketch[];
  platformioIni: string;
  readme: string;
  libraries: string[];
}

type BoardFamily = "esp32c3" | "esp32" | "nano" | "pico" | "unknown";

function detectBoard(parts: Part[]): { family: BoardFamily; id: string; label: string; arduinoBoard: string } {
  const ids = parts.map((p) => p.catalogId).filter(Boolean) as string[];
  if (ids.includes("esp32-c3") || parts.some((p) => /esp32-?c3/i.test(`${p.name} ${p.specification}`))) {
    return {
      family: "esp32c3",
      id: "esp32-c3",
      label: "ESP32-C3",
      arduinoBoard: "ESP32C3 Dev Module (ESP32 Arduino core)",
    };
  }
  if (ids.includes("esp32-devkit") || parts.some((p) => /\besp32\b/i.test(`${p.name} ${p.specification}`) && !/c3/i.test(p.name))) {
    return {
      family: "esp32",
      id: "esp32-devkit",
      label: "ESP32 DevKit",
      arduinoBoard: "ESP32 Dev Module",
    };
  }
  if (ids.includes("arduino-nano") || parts.some((p) => /nano/i.test(p.name))) {
    return {
      family: "nano",
      id: "arduino-nano",
      label: "Arduino Nano",
      arduinoBoard: "Arduino Nano",
    };
  }
  if (ids.includes("raspberry-pi-pico") || parts.some((p) => /pico|rp2040/i.test(`${p.name} ${p.specification}`))) {
    return {
      family: "pico",
      id: "raspberry-pi-pico",
      label: "Raspberry Pi Pico",
      arduinoBoard: "Raspberry Pi Pico (earlephilhower or Arduino Mbed)",
    };
  }
  return { family: "unknown", id: "unknown", label: "Unknown MCU", arduinoBoard: "Select your board in the IDE" };
}

function extractGpio(endpoint: string): number | null {
  const m = endpoint.match(/GPIO\s*(\d+)/i) || endpoint.match(/\bGP(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  // Arduino Nano style D2 / A4
  const d = endpoint.match(/\bD(\d+)\b/i);
  if (d) return parseInt(d[1], 10);
  return null;
}

function endpointRole(endpoint: string): string {
  const e = endpoint.toUpperCase();
  if (/\bSDA\b/.test(e)) return "SDA";
  if (/\bSCL\b/.test(e)) return "SCL";
  if (/\bTOUCH\b|\bSIG\b/.test(e) && /TOUCH|TTP|CAPACITIVE/i.test(endpoint)) return "TOUCH";
  if (/\bTOUCH\b/.test(e)) return "TOUCH";
  if (/\bTRIG\b/.test(e)) return "TRIG";
  if (/\bECHO\b/.test(e)) return "ECHO";
  return "";
}

/** Build pin map from wiringConnections + catalog defaults. */
export function buildPinMap(plan: BuildPlan): Record<string, number | string> {
  const board = detectBoard(plan.parts || []);
  const map: Record<string, number | string> = {};
  const connections = plan.wiringConnections || [];

  for (const c of connections) {
    const fromGpio = extractGpio(c.from);
    const toGpio = extractGpio(c.to);
    const fromRole = endpointRole(c.from) || endpointRole(c.to);
    const toRole = endpointRole(c.to) || endpointRole(c.from);

    // Prefer role from the non-MCU side label combined with MCU GPIO
    const pair: [string, string] = [c.from, c.to];
    for (const end of pair) {
      const other = end === c.from ? c.to : c.from;
      const gpio = extractGpio(end);
      if (gpio == null) continue;
      const role =
        endpointRole(other) ||
        endpointRole(end) ||
        (/\bSDA\b/i.test(other + end) ? "SDA" : "") ||
        (/\bSCL\b/i.test(other + end) ? "SCL" : "") ||
        (/\bTOUCH|SIG\b/i.test(other) ? "TOUCH" : "");
      if (role === "SDA") map.PIN_SDA = gpio;
      if (role === "SCL") map.PIN_SCL = gpio;
      if (role === "TOUCH" || (/\btouch/i.test(other) && role !== "SDA" && role !== "SCL")) map.PIN_TOUCH = gpio;
      if (role === "TRIG") map.PIN_TRIG = gpio;
      if (role === "ECHO") map.PIN_ECHO = gpio;
    }

    // Explicit "GPIO4 (SDA)" style on MCU side
    if (fromGpio != null && /\bSDA\b/i.test(c.from)) map.PIN_SDA = fromGpio;
    if (fromGpio != null && /\bSCL\b/i.test(c.from)) map.PIN_SCL = fromGpio;
    if (fromGpio != null && /\bTOUCH\b/i.test(c.from)) map.PIN_TOUCH = fromGpio;
    if (toGpio != null && /\bSDA\b/i.test(c.to)) map.PIN_SDA = toGpio;
    if (toGpio != null && /\bSCL\b/i.test(c.to)) map.PIN_SCL = toGpio;
  }

  // Catalog defaults if wiring omitted
  const mod = getModuleById(board.id);
  if (map.PIN_SDA == null && mod?.defaultI2c) {
    const sda = extractGpio(mod.defaultI2c.sda);
    const scl = extractGpio(mod.defaultI2c.scl);
    if (sda != null) map.PIN_SDA = sda;
    if (scl != null) map.PIN_SCL = scl;
  }
  if (board.family === "esp32c3") {
    if (map.PIN_SDA == null) map.PIN_SDA = 4;
    if (map.PIN_SCL == null) map.PIN_SCL = 5;
    if (map.PIN_TOUCH == null && (plan.parts || []).some((p) => p.catalogId === "touch-switch" || /touch/i.test(p.name))) {
      map.PIN_TOUCH = 0;
    }
  }
  if (board.family === "esp32") {
    if (map.PIN_SDA == null) map.PIN_SDA = 21;
    if (map.PIN_SCL == null) map.PIN_SCL = 22;
  }
  if (board.family === "nano") {
    if (map.PIN_SDA == null) map.PIN_SDA = "A4";
    if (map.PIN_SCL == null) map.PIN_SCL = "A5";
  }

  map.I2C_OLED_ADDR = 0x3c;
  if ((plan.parts || []).some((p) => p.catalogId === "sht31d" || /sht31/i.test(p.name))) {
    map.I2C_SHT_ADDR = 0x44;
  }
  if ((plan.parts || []).some((p) => p.catalogId === "bme280" || /bme280/i.test(p.name))) {
    map.I2C_BME_ADDR = 0x76;
  }

  return map;
}

function pinDefines(map: Record<string, number | string>): string {
  const lines = [
    "// Auto-generated by Forge — matches your build plan wiring",
    "// If a pin is wrong, fix the wiring diagram first, then regenerate.",
    "#pragma once",
    "",
  ];
  for (const [k, v] of Object.entries(map)) {
    if (typeof v === "number" && k.startsWith("I2C_")) {
      lines.push(`#define ${k} 0x${v.toString(16).toUpperCase()}`);
    } else if (typeof v === "number") {
      lines.push(`#define ${k} ${v}`);
    } else {
      lines.push(`#define ${k} ${v}`);
    }
  }
  return lines.join("\n") + "\n";
}

function pinLiteral(v: number | string | undefined, fallback: number): string {
  if (v == null) return String(fallback);
  if (typeof v === "string") return v; // A4
  return String(v);
}

function hasPart(parts: Part[], ...preds: Array<(p: Part) => boolean>): boolean {
  return parts.some((p) => preds.some((fn) => fn(p)));
}

function sketchBlink(board: ReturnType<typeof detectBoard>, map: Record<string, number | string>): FirmwareSketch {
  const led = board.family === "esp32c3" || board.family === "esp32" ? "LED_BUILTIN /* or GPIO8 on some C3 boards */" : "LED_BUILTIN";
  return {
    id: "blink",
    name: "1 · Board smoke test (Blink)",
    description: "Proves USB, board select, and upload work before sensors.",
    filename: "01_blink/01_blink.ino",
    phase: "smoke",
    libraries: [],
    code: `// Forge — smoke test for ${board.label}
// Upload this first. If Blink works, your cable + board + port are good.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
  delay(500);
  Serial.println("Forge smoke test: ${board.label} alive");
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(400);
  digitalWrite(LED_BUILTIN, LOW);
  delay(400);
}
`,
  };
}

function sketchI2cScanner(map: Record<string, number | string>): FirmwareSketch {
  const sda = pinLiteral(map.PIN_SDA, 4);
  const scl = pinLiteral(map.PIN_SCL, 5);
  return {
    id: "i2c_scanner",
    name: "2 · I2C scanner",
    description: "Lists every device on SDA/SCL — use when OLED or sensors are silent.",
    filename: "02_i2c_scanner/02_i2c_scanner.ino",
    phase: "bus",
    libraries: ["Wire"],
    code: `// Forge — I2C bus scanner
// Expected for Sat Line-style builds: 0x3C (OLED), often 0x44 (SHT31)

#include <Wire.h>

#ifndef PIN_SDA
#define PIN_SDA ${sda}
#endif
#ifndef PIN_SCL
#define PIN_SCL ${scl}
#endif

void setup() {
  Serial.begin(115200);
  delay(800);
  Wire.begin(PIN_SDA, PIN_SCL);
  Serial.println();
  Serial.println("Forge I2C scanner");
  Serial.print("SDA=GPIO"); Serial.print(PIN_SDA);
  Serial.print("  SCL=GPIO"); Serial.println(PIN_SCL);
}

void loop() {
  byte count = 0;
  Serial.println("--- scan ---");
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      count++;
    }
  }
  if (count == 0) Serial.println("No I2C devices. Check SDA/SCL swap, 3.3V, GND.");
  else Serial.print("Total: "); Serial.println(count);
  delay(3000);
}
`,
  };
}

function sketchOled(map: Record<string, number | string>): FirmwareSketch {
  const sda = pinLiteral(map.PIN_SDA, 4);
  const scl = pinLiteral(map.PIN_SCL, 5);
  const addr = typeof map.I2C_OLED_ADDR === "number" ? map.I2C_OLED_ADDR : 0x3c;
  return {
    id: "oled_test",
    name: "3 · OLED test",
    description: "Draws text on SSD1306. Library: Adafruit SSD1306 + GFX.",
    filename: "03_oled_test/03_oled_test.ino",
    phase: "subsystem",
    libraries: ["Wire", "Adafruit SSD1306", "Adafruit GFX"],
    code: `// Forge — SSD1306 OLED test (I2C)
// Arduino Library Manager: "Adafruit SSD1306" and "Adafruit GFX"

#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define PIN_SDA ${sda}
#define PIN_SCL ${scl}
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x${Number(addr).toString(16)}

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 not found — run I2C scanner, check 0x3C vs 0x3D");
    for (;;);
  }
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Forge OLED OK");
  display.print("SDA "); display.println(PIN_SDA);
  display.print("SCL "); display.println(PIN_SCL);
  display.display();
}

void loop() {
  // Static test pattern
}
`,
  };
}

function sketchSht(map: Record<string, number | string>): FirmwareSketch {
  const sda = pinLiteral(map.PIN_SDA, 4);
  const scl = pinLiteral(map.PIN_SCL, 5);
  return {
    id: "sensor_test",
    name: "4 · SHT31 sensor test",
    description: "Prints temperature/humidity. Library: Adafruit SHT31.",
    filename: "04_sensor_test/04_sensor_test.ino",
    phase: "subsystem",
    libraries: ["Wire", "Adafruit SHT31"],
    code: `// Forge — SHT31 temperature/humidity test
// Library Manager: "Adafruit SHT31"

#include <Wire.h>
#include "Adafruit_SHT31.h"

#define PIN_SDA ${sda}
#define PIN_SCL ${scl}

Adafruit_SHT31 sht = Adafruit_SHT31();

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);
  if (!sht.begin(0x44)) {
    Serial.println("SHT31 not found at 0x44 — try 0x45 or run I2C scanner");
    while (1) delay(1);
  }
  Serial.println("SHT31 ready");
}

void loop() {
  float t = sht.readTemperature();
  float h = sht.readHumidity();
  Serial.print("T="); Serial.print(t); Serial.print(" C  RH=");
  Serial.print(h); Serial.println(" %");
  delay(1000);
}
`,
  };
}

function sketchFullApp(
  board: ReturnType<typeof detectBoard>,
  map: Record<string, number | string>,
  plan: BuildPlan
): FirmwareSketch {
  const sda = pinLiteral(map.PIN_SDA, 4);
  const scl = pinLiteral(map.PIN_SCL, 5);
  const touch = map.PIN_TOUCH != null ? pinLiteral(map.PIN_TOUCH, 0) : null;
  const hasOled = hasPart(plan.parts || [], (p) => p.catalogId === "ssd1306-i2c" || /oled|ssd1306/i.test(p.name));
  const hasSht = hasPart(plan.parts || [], (p) => p.catalogId === "sht31d" || /sht31/i.test(p.name));
  const hasWifi = board.family === "esp32c3" || board.family === "esp32";

  const libs = ["Wire"];
  if (hasOled) libs.push("Adafruit SSD1306", "Adafruit GFX");
  if (hasSht) libs.push("Adafruit SHT31");

  const code = `// Forge full sketch for: ${plan.title.replace(/"/g, "'")}
// Board: ${board.label}
// Pins match plan wiring — change wiring in Forge, not random pin numbers here.
//
// SETUP
// 1. Install ESP32 board support (if ESP) + libraries listed below
// 2. Set WIFI_SSID / WIFI_PASSWORD
// 3. Select board: ${board.arduinoBoard}
// 4. Upload, open Serial Monitor 115200

${hasWifi ? `#include <WiFi.h>
#include <time.h>
` : ""}#include <Wire.h>
${hasOled ? `#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
` : ""}${hasSht ? `#include "Adafruit_SHT31.h"
` : ""}
#define PIN_SDA ${sda}
#define PIN_SCL ${scl}
${touch != null ? `#define PIN_TOUCH ${touch}
` : ""}${hasOled ? `#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
` : ""}${hasSht ? `Adafruit_SHT31 sht = Adafruit_SHT31();
` : ""}
${hasWifi ? `// --- put your network here ---
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
` : ""}${touch != null ? `bool displayOn = true;
bool lastTouch = false;
` : ""}
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Forge app: ${plan.title.replace(/"/g, "'")}");
  Wire.begin(PIN_SDA, PIN_SCL);
${touch != null ? `  pinMode(PIN_TOUCH, INPUT);
` : ""}${hasOled ? `  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED missing");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Forge boot...");
    display.display();
  }
` : ""}${hasSht ? `  if (!sht.begin(0x44)) Serial.println("SHT31 missing");
` : ""}${hasWifi ? `  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250); Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK" : " FAIL");
  if (WiFi.status() == WL_CONNECTED) {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  }
` : ""}}

void loop() {
${touch != null ? `  bool touchNow = digitalRead(PIN_TOUCH) == HIGH;
  if (touchNow && !lastTouch) displayOn = !displayOn;
  lastTouch = touchNow;
` : ""}${hasSht ? `  float t = sht.readTemperature();
  float h = sht.readHumidity();
` : ""}${hasWifi ? `  struct tm timeinfo;
  bool haveTime = getLocalTime(&timeinfo, 50);
` : ""}${hasOled ? `  if (!displayOn) {
    display.clearDisplay();
    display.display();
    delay(100);
    return;
  }
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.println("${plan.title.slice(0, 20).replace(/"/g, "")}");
${hasWifi ? `  if (haveTime) {
    display.setTextSize(2);
    char buf[16];
    strftime(buf, sizeof(buf), "%H:%M:%S", &timeinfo);
    display.println(buf);
    display.setTextSize(1);
  } else {
    display.println(WiFi.status() == WL_CONNECTED ? "Syncing time..." : "WiFi down");
  }
` : ""}${hasSht ? `  display.print("T "); display.print(t, 1); display.println(" C");
  display.print("RH "); display.print(h, 0); display.println(" %");
` : ""}  display.display();
` : `  // No OLED in BOM — print to serial
${hasSht ? `  Serial.print("T="); Serial.print(t); Serial.print(" RH="); Serial.println(h);
` : `  Serial.println("running");
`}`}
  delay(200);
}
`;

  return {
    id: "full_app",
    name: "5 · Full app sketch",
    description: "Integrated firmware matching your BOM (Wi-Fi/time/OLED/sensor/touch as present).",
    filename: "05_full_app/05_full_app.ino",
    phase: "app",
    libraries: libs,
    code,
  };
}

function platformioIni(board: ReturnType<typeof detectBoard>, libs: string[]): string {
  let env = "esp32dev";
  let platform = "espressif32";
  if (board.family === "esp32c3") env = "esp32-c3-devkitm-1";
  if (board.family === "nano") {
    platform = "atmelavr";
    env = "nanoatmega328";
  }
  if (board.family === "pico") {
    platform = "raspberrypi";
    env = "pico";
  }
  const libDeps = libs
    .filter((l) => !["Wire", "WiFi"].includes(l))
    .map((l) => `  ${l}`)
    .join("\n");
  return `; Forge-generated PlatformIO project
[env:${env}]
platform = ${platform}
board = ${env}
framework = arduino
monitor_speed = 115200
${libDeps ? `lib_deps =\n${libDeps}` : ""}
`;
}

/**
 * Generate a full firmware package from a build plan.
 * Pin numbers come from wiringConnections (source of truth).
 */
export function generateFirmware(plan: BuildPlan): FirmwarePackage | null {
  const parts = plan.parts || [];
  const board = detectBoard(parts);
  if (board.family === "unknown") return null;

  const map = buildPinMap(plan);
  const sketches: FirmwareSketch[] = [sketchBlink(board, map)];

  const needsI2c =
    hasPart(parts, (p) => p.catalogId === "ssd1306-i2c" || p.catalogId === "sht31d" || p.catalogId === "bme280") ||
    map.PIN_SDA != null;

  if (needsI2c) sketches.push(sketchI2cScanner(map));
  if (hasPart(parts, (p) => p.catalogId === "ssd1306-i2c" || /oled|ssd1306/i.test(p.name))) {
    sketches.push(sketchOled(map));
  }
  if (hasPart(parts, (p) => p.catalogId === "sht31d" || /sht31/i.test(p.name))) {
    sketches.push(sketchSht(map));
  }
  sketches.push(sketchFullApp(board, map, plan));

  const allLibs = [...new Set(sketches.flatMap((s) => s.libraries))];
  const pinDef = pinDefines(map);

  const readme = `# Firmware for ${plan.title}

Generated by Forge so pin numbers match your wiring plan.

## Board
- **${board.label}**
- Arduino IDE: ${board.arduinoBoard}
- Serial: **115200 baud**

## Pin map (from plan wiring)
${Object.entries(map)
  .map(([k, v]) => `- \`${k}\` = ${typeof v === "number" && k.startsWith("I2C_") ? "0x" + v.toString(16) : v}`)
  .join("\n")}

## Upload order (don't skip)
1. **01_blink** — cable + board + port
2. **02_i2c_scanner** — see 0x3C / sensor addresses
3. Subsystem tests (OLED / sensor)
4. **05_full_app** — set Wi-Fi credentials first

## Libraries (Arduino Library Manager)
${allLibs.map((l) => `- ${l}`).join("\n") || "- (none beyond core)"}

## PlatformIO
Use the generated \`platformio.ini\` if you prefer PIO over Arduino IDE.
`;

  return {
    boardId: board.id,
    boardLabel: board.label,
    arduinoBoard: board.arduinoBoard,
    pinMap: map,
    pinDefines: pinDef,
    sketches,
    platformioIni: platformioIni(board, allLibs),
    readme,
    libraries: allLibs,
  };
}

/** True when this step is primarily about code upload. */
export function isSoftwareStep(step?: { title?: string; description?: string }): boolean {
  return stepKind(step) === "software";
}

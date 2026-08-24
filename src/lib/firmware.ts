import type { BuildPlan, BuildStep, Part } from "./types";
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

export type BoardFamily = "esp32c3" | "esp32" | "nano" | "pico" | "unknown";

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

/* ── Get-your-computer-ready reference data (C4) ─────────────────────────
 * The "what do I even install" step before any code ever gets to the board.
 * Kept separate from generateFirmware() on purpose: this data is useful even
 * when we have no sketches for the board (see the honest unknown-board state
 * in build-ui.tsx), and it never changes with the plan's wiring.
 */

export interface BoardSetupDriverNote {
  /** USB-to-serial chip name, e.g. "CH340". */
  chip: string;
  /** Official vendor driver download page. */
  url: string;
  /** One-line context for when this chip shows up. */
  hint: string;
}

export interface BoardSetupInfo {
  /** Arduino IDE download page — same URL for every family. */
  ideUrl: string;
  /** Paste into Arduino IDE → Settings → Additional boards manager URLs. null = ships built-in, nothing to add. */
  boardManagerUrl: string | null;
  /** What to type into Boards Manager's search box. */
  boardPackageName: string;
  /** The exact Tools → Board menu entry to select. */
  boardSelectName: string;
  /** Common USB-to-serial chips this family ships with, for when no port shows up. */
  driverNotes: BoardSetupDriverNote[];
}

const ARDUINO_IDE_URL = "https://www.arduino.cc/en/software";

// The same two chips cover the overwhelming majority of budget ESP32 /
// Nano-clone boards — official vendor driver pages only (WCH, Silicon Labs).
// Many boards (native-USB ESP32-C3/S3, genuine Nano, Pico) need neither on a
// modern macOS or Windows 10/11 — that caveat is UI copy (see ComputerReady),
// not per-chip data.
const USB_UART_DRIVER_NOTES: BoardSetupDriverNote[] = [
  { chip: "CH340", url: "https://www.wch-ic.com/downloads/CH341SER_ZIP.html", hint: "most common on budget boards" },
  { chip: "CP210x", url: "https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers", hint: "common on official ESP32 dev boards" },
];

const BOARD_SETUP: Record<Exclude<BoardFamily, "unknown">, BoardSetupInfo> = {
  esp32c3: {
    ideUrl: ARDUINO_IDE_URL,
    boardManagerUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
    boardPackageName: "esp32 by Espressif Systems",
    boardSelectName: "ESP32C3 Dev Module",
    driverNotes: USB_UART_DRIVER_NOTES,
  },
  esp32: {
    ideUrl: ARDUINO_IDE_URL,
    boardManagerUrl: "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
    boardPackageName: "esp32 by Espressif Systems",
    boardSelectName: "ESP32 Dev Module",
    driverNotes: USB_UART_DRIVER_NOTES,
  },
  nano: {
    ideUrl: ARDUINO_IDE_URL,
    boardManagerUrl: null,
    boardPackageName: "Arduino AVR Boards (built-in — nothing to add)",
    boardSelectName: "Arduino Nano",
    driverNotes: USB_UART_DRIVER_NOTES,
  },
  pico: {
    ideUrl: ARDUINO_IDE_URL,
    boardManagerUrl:
      "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
    boardPackageName: "Raspberry Pi Pico/RP2040 by Earle F. Philhower, III",
    boardSelectName: "Raspberry Pi Pico",
    driverNotes: USB_UART_DRIVER_NOTES,
  },
};

/**
 * "Get your computer ready" reference data for a detected board family —
 * official vendor sources only (arduino.cc, Espressif's own package index,
 * the community RP2040 core's own package index, WCH/Silicon Labs for
 * USB-UART drivers). Returns null for "unknown": there's no board-support
 * package to name when Forge couldn't identify the board — see the honest
 * unknown-board state in build-ui.tsx, which falls back to IDE + driver
 * info only in that case.
 */
export function boardSetupInfo(family: BoardFamily): BoardSetupInfo | null {
  return family === "unknown" ? null : BOARD_SETUP[family];
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

function sketchBlink(board: ReturnType<typeof detectBoard>): FirmwareSketch {
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
  Serial.println("blink");
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

  // Online weather + rotating custom messages only make sense with a screen and
  // (for weather) an internet-capable board. Each section degrades cleanly.
  const hasWeather = hasWifi && hasOled;
  const hasMessages = hasOled;
  const title = plan.title.replace(/"/g, "'");

  const libs = ["Wire"];
  if (hasOled) libs.push("Adafruit SSD1306", "Adafruit GFX");
  if (hasSht) libs.push("Adafruit SHT31");

  // Built from parts so every BOM combination stays valid C++.
  const parts: string[] = [];

  parts.push(`// Forge full app for: ${title}
// Board: ${board.label}
//
// This is YOUR code — edit the "EDIT HERE" block below freely.
// Pin numbers match your Forge wiring plan; change wiring in Forge, not here.
//
// SETUP
//  1. Install ESP32 board support + the libraries listed at the bottom
//  2. Fill in the EDIT HERE block (Wi-Fi, your city, your messages)
//  3. Select board: ${board.arduinoBoard}, upload, open Serial Monitor at 115200
`);

  parts.push(
    (hasWifi ? `#include <WiFi.h>\n#include <time.h>\n` : "") +
      (hasWeather ? `#include <HTTPClient.h>\n` : "") +
      `#include <Wire.h>\n` +
      (hasOled ? `#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n` : "") +
      (hasSht ? `#include "Adafruit_SHT31.h"\n` : "")
  );

  const cfg: string[] = ["// ================= EDIT HERE — make it yours ================="];
  if (hasWifi)
    cfg.push(`const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";`);
  if (hasWeather)
    cfg.push(`// Your city's coordinates — search "<your city> latitude longitude":
const float LATITUDE  = 40.7128;    // example: New York City
const float LONGITUDE = -74.0060;`);
  if (hasWifi)
    cfg.push(`// Timezone: hours from GMT (EST -5, CST -6, MST -7, PST -8, UK 0, CET +1):
const int GMT_OFFSET_HOURS      = -5;
const int DAYLIGHT_OFFSET_HOURS = 1;   // set to 0 when daylight saving is off`);
  if (hasMessages)
    cfg.push(`// Your messages — the screen rotates through these. Add as many as you like:
const char* MESSAGES[] = {
  "Hi :)",
  "Thinking of you",
  "Have a good day",
};
const int MESSAGE_COUNT = sizeof(MESSAGES) / sizeof(MESSAGES[0]);`);
  cfg.push("// =============================================================\n");
  parts.push(cfg.join("\n"));

  parts.push(
    `#define PIN_SDA ${sda}\n#define PIN_SCL ${scl}\n` +
      (touch != null ? `#define PIN_TOUCH ${touch}\n` : "") +
      (hasOled
        ? `#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\n#define OLED_ADDR 0x3C\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);\n`
        : "") +
      (hasSht ? `Adafruit_SHT31 sht = Adafruit_SHT31();\n` : "") +
      (touch != null ? `bool displayOn = true;\nbool lastTouch = false;\n` : "") +
      (hasWeather ? `float g_outTemp = NAN;\nString g_outText = "--";\nunsigned long g_lastWeather = 0;\n` : "") +
      // Retried in loop() below, not just attempted once here — a Wi-Fi
      // connect that fails or later drops otherwise leaves the sketch
      // stuck (e.g. "Syncing time..." forever) with no way to recover.
      (hasWifi ? `unsigned long g_lastWifiRetry = 0;\n` : "")
  );

  if (hasWeather) {
    parts.push(`// Map Open-Meteo WMO weather codes to a short label.
String weatherText(int code) {
  if (code == 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code == 45 || code == 48) return "Fog";
  if (code >= 51 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 95) return "Storm";
  return "--";
}

// Read the numeric value for a JSON key, skipping the units section (whose
// value is a string, not a number) so we get the real reading.
float jsonNumber(String& b, const char* key) {
  int i = 0;
  while ((i = b.indexOf(key, i)) >= 0) {
    int c = b.indexOf(':', i);
    if (c < 0) return NAN;
    int j = c + 1;
    while (j < (int)b.length() && b[j] == ' ') j++;
    char ch = b[j];
    if ((ch >= '0' && ch <= '9') || ch == '-') return b.substring(j).toFloat();
    i = c + 1;
  }
  return NAN;
}

// Fetch current outdoor conditions from Open-Meteo (free, no API key needed).
void fetchWeather() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = "http://api.open-meteo.com/v1/forecast?latitude=" + String(LATITUDE, 4) +
               "&longitude=" + String(LONGITUDE, 4) +
               "&current=temperature_2m,weather_code&timezone=auto";
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String body = http.getString();
    float tp = jsonNumber(body, "temperature_2m");
    float wc = jsonNumber(body, "weather_code");
    if (!isnan(tp)) g_outTemp = tp;
    if (!isnan(wc)) g_outText = weatherText((int)wc);
  }
  http.end();
}
`);
  }

  parts.push(
    `void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Forge app: ${title}");
  Wire.begin(PIN_SDA, PIN_SCL);
` +
      (touch != null ? `  pinMode(PIN_TOUCH, INPUT);\n` : "") +
      (hasOled
        ? `  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("OLED missing — check 0x3C vs 0x3D and wiring");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("Forge boot...");
    display.display();
  }
`
        : "") +
      (hasSht ? `  if (!sht.begin(0x44)) Serial.println("SHT3x missing at 0x44");\n` : "") +
      (hasWifi
        ? `  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) { delay(250); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK" : " FAIL");
  if (WiFi.status() == WL_CONNECTED) {
    configTime(GMT_OFFSET_HOURS * 3600, DAYLIGHT_OFFSET_HOURS * 3600, "pool.ntp.org", "time.nist.gov");
${hasWeather ? `    fetchWeather();\n    g_lastWeather = millis();\n` : ""}  }
`
        : "") +
      `}\n`
  );

  const loopBody: string[] = [];
  if (touch != null)
    loopBody.push(`  bool touchNow = digitalRead(PIN_TOUCH) == HIGH;
  if (touchNow && !lastTouch) displayOn = !displayOn;
  lastTouch = touchNow;`);
  if (hasSht)
    loopBody.push(`  float t = sht.readTemperature();
  float h = sht.readHumidity();`);
  if (hasWifi)
    // Retries every 30s while disconnected — setup() above only ever
    // attempts once, so without this a failed or dropped connection never
    // recovers on its own.
    loopBody.push(`  if (WiFi.status() != WL_CONNECTED && millis() - g_lastWifiRetry > 30000UL) {
    g_lastWifiRetry = millis();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
  struct tm timeinfo;
  bool haveTime = getLocalTime(&timeinfo, 50);`);
  if (hasWeather)
    loopBody.push(`  if (millis() - g_lastWeather > 900000UL) { fetchWeather(); g_lastWeather = millis(); }`);

  if (hasOled) {
    const oled: string[] = [];
    if (touch != null)
      oled.push(`  if (!displayOn) { display.clearDisplay(); display.display(); delay(100); return; }`);
    oled.push(`  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);`);
    if (hasMessages)
      oled.push(`  // Every 20s, flash one of your messages full-screen for ~5s.
  unsigned long nowMs = millis();
  if (MESSAGE_COUNT > 0 && (nowMs % 20000UL) < 5000UL) {
    int mi = (nowMs / 20000UL) % MESSAGE_COUNT;
    display.setTextSize(2);
    display.setCursor(0, 20);
    display.println(MESSAGES[mi]);
    display.display();
    delay(200);
    return;
  }`);
    if (hasWifi)
      oled.push(`  if (haveTime) {
    char buf[8]; strftime(buf, sizeof(buf), "%H:%M", &timeinfo);
    display.setTextSize(2); display.setCursor(0, 0); display.println(buf);
    char dbuf[20]; strftime(dbuf, sizeof(dbuf), "%a %b %d", &timeinfo);
    display.setTextSize(1); display.setCursor(0, 20); display.println(dbuf);
  } else {
    display.setTextSize(1); display.setCursor(0, 0);
    display.println(WiFi.status() == WL_CONNECTED ? "Syncing time..." : "WiFi down");
  }`);
    oled.push(`  display.setTextSize(1);`);
    if (hasSht)
      oled.push(`  display.setCursor(0, 36);
  display.print("In  "); display.print(t, 1); display.print("C  "); display.print(h, 0); display.println("%");`);
    if (hasWeather)
      oled.push(`  display.setCursor(0, 48);
  if (!isnan(g_outTemp)) { display.print("Out "); display.print(g_outTemp, 1); display.print("C  "); display.println(g_outText); }
  else { display.println("Out --"); }`);
    oled.push(`  display.display();`);
    loopBody.push(oled.join("\n"));
  } else if (hasSht) {
    loopBody.push(`  Serial.print("T="); Serial.print(t); Serial.print(" RH="); Serial.println(h);`);
  } else {
    loopBody.push(`  Serial.println("running");`);
  }
  loopBody.push(`  delay(200);`);

  parts.push(`void loop() {\n${loopBody.join("\n")}\n}\n`);

  const code = parts.join("\n");

  return {
    id: "full_app",
    name: "5 · Full app sketch",
    description:
      "Weather clock: Wi-Fi time, indoor temp/humidity, online forecast (Open-Meteo), and your own rotating messages. Adapts to your BOM.",
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
  const sketches: FirmwareSketch[] = [sketchBlink(board)];

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

/* ── Sketch-derived doneWhen ─────────────────────────────────────────────
 * A software step's "check your work" copy is far more useful when it names
 * the actual sketch to upload and describes what THAT sketch does — instead
 * of generic "looks finished" prose. Matches a step to its sketch the same
 * way compile.ts assigns wiring connections to steps (weighted-substring
 * token scoring — see scoreEdgeAgainst/edgeTokens there): tokens come from
 * each sketch's id/phase/name/description, weighted by specificity, matched
 * as substrings against the step's title+description. No match (or a tie at
 * zero) falls back to the LAST sketch — in practice always `full_app`, since
 * generateFirmware() pushes it unconditionally last — because a step that
 * doesn't name a specific sketch is almost always "upload the final thing."
 */

const DONE_WHEN_STOP_WORDS = new Set([
  "the", "and", "for", "with", "your", "this", "that", "from", "into",
  "before", "after", "when", "then", "use", "using", "you", "will", "are",
]);

function sketchTokens(s: FirmwareSketch): { token: string; weight: number }[] {
  const tokens: { token: string; weight: number }[] = [];
  const push = (raw: string, weight: number) => {
    const t = raw.toLowerCase().trim();
    if (t.length >= 3 && !DONE_WHEN_STOP_WORDS.has(t)) tokens.push({ token: t, weight });
  };
  for (const part of s.id.split("_")) push(part, 3);
  push(s.phase, 3);
  for (const w of s.name.toLowerCase().split(/[^a-z0-9]+/)) push(w, 2);
  for (const w of s.description.toLowerCase().split(/[^a-z0-9]+/)) push(w, 1);
  return tokens;
}

function scoreSketchAgainst(blob: string, s: FirmwareSketch): number {
  let score = 0;
  for (const { token, weight } of sketchTokens(s)) {
    if (blob.includes(token)) score += weight;
  }
  return score;
}

/** I2C addresses the scanner should find, derived from which subsystem sketches actually got generated (a direct proxy for "this part is in the BOM" — see generateFirmware's hasPart gating). */
function scannerAddressesExpected(firmware: FirmwarePackage): string {
  const found: string[] = [];
  if (firmware.sketches.some((s) => s.id === "oled_test")) {
    const addr = typeof firmware.pinMap.I2C_OLED_ADDR === "number" ? firmware.pinMap.I2C_OLED_ADDR : 0x3c;
    found.push(`0x${addr.toString(16).toUpperCase()} (display)`);
  }
  if (firmware.sketches.some((s) => s.id === "sensor_test")) {
    const addr = typeof firmware.pinMap.I2C_SHT_ADDR === "number" ? firmware.pinMap.I2C_SHT_ADDR : 0x44;
    found.push(`0x${addr.toString(16).toUpperCase()} (sensor)`);
  }
  return found.length ? found.join(" and ") : "your display/sensor addresses";
}

/** What the full-app sketch actually shows, sniffed from its own generated code — never claim a clock face on a build with no OLED. */
function appExpected(sketch: FirmwareSketch): string {
  const code = sketch.code;
  const hasOled = /Adafruit_SSD1306/.test(code);
  const hasClock = /getLocalTime|configTime/.test(code);
  const hasSensor = /Adafruit_SHT31/.test(code);
  if (hasOled && hasClock) return "the clock face light up with the time";
  if (hasOled && hasSensor) return "temperature and humidity update on the display";
  if (hasOled) return "the display update with your build's status";
  if (hasSensor) return "new temperature/humidity numbers in Serial Monitor";
  return "new status lines appear in Serial Monitor every so often";
}

function expectedForSketch(sketch: FirmwareSketch, firmware: FirmwarePackage): string {
  switch (sketch.id) {
    case "blink":
      return 'the onboard LED blink every 400ms and "blink" printed in Serial Monitor';
    case "i2c_scanner":
      return `a list of I2C addresses — expect ${scannerAddressesExpected(firmware)}`;
    case "oled_test":
      return '"Forge OLED OK" appear on the display, with your SDA/SCL pin numbers underneath';
    case "sensor_test":
      return "a new temperature and humidity reading print about once a second";
    case "full_app":
      return appExpected(sketch);
    default:
      return sketch.description
        ? `${sketch.description.replace(/\.$/, "")}, working as described`
        : "the sketch run without errors in Serial Monitor";
  }
}

/**
 * Sketch-derived doneWhen for a software step — see block comment above.
 * Returns null only when the firmware package has no sketches at all.
 */
export function doneWhenForSoftwareStep(step: BuildStep, firmware: FirmwarePackage): string | null {
  const sketches = firmware.sketches;
  if (!sketches.length) return null;
  const blob = `${step.title || ""} ${step.description || ""}`.toLowerCase();

  let best: { sketch: FirmwareSketch; score: number } | null = null;
  for (const s of sketches) {
    const score = scoreSketchAgainst(blob, s);
    if (score > 0 && (!best || score > best.score)) best = { sketch: s, score };
  }
  const sketch = best?.sketch ?? sketches[sketches.length - 1];
  const expected = expectedForSketch(sketch, firmware);
  return `Upload ${sketch.filename}, open Serial Monitor at 115200 baud — you should see ${expected}.`;
}

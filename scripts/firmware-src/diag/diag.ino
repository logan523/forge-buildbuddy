// Forge — diagnostic firmware (one-tap "Flash test firmware" sketch, C2)
//
// What this proves, in order:
//   1. The board flashed correctly and boots at all   (this sketch runs)
//   2. USB serial is alive                             (the FORGE-DIAG line below)
//   3. I2C wiring is good                               (the scan every 3s)
//   4. The board is generally alive                     (LED blink every 400ms)
//
// Config protocol (optional): for 2 seconds after boot, this sketch listens
// on Serial for ONE line of JSON: {"sda":4,"scl":5}. Forge's flash flow
// (src/components/flash/flash-flow.tsx) sends this right after flashing so
// the scan uses your actual wiring pins instead of the ESP32-C3 defaults
// below. If nothing arrives in the window — e.g. you opened this in a plain
// serial monitor with nothing to send — the defaults are used and nothing
// else about the sketch's behavior changes.
//
// The I2C scan line format is byte-for-byte identical to the generated
// scanner sketch (src/lib/firmware.ts, sketchI2cScanner) — Forge's serial
// console (src/lib/serial/line-parser.ts, parseScannerLine) already parses
// this exact format live:
//   "Found device at 0x" + two uppercase hex digits, e.g. "Found device at 0x3C"
//
// Dependency-free on purpose: Wire.h only, no ArduinoJson — so
// `arduino-cli compile` (scripts/compile-firmware.mjs) never needs a
// library-install step beyond the esp32 core itself.

#include <Wire.h>

// Onboard LED: most ESP32-C3 "SuperMini" boards wire it to GPIO8, active-LOW
// (LOW = lit). If your board's LED lives elsewhere, or is active-HIGH,
// change LED_PIN / LED_ON here — nothing else in this sketch depends on it.
#define LED_PIN 8
#define LED_ON LOW
#define LED_OFF HIGH

#define DEFAULT_SDA 4
#define DEFAULT_SCL 5

#define CONFIG_WINDOW_MS 2000UL
#define BLINK_INTERVAL_MS 400UL
#define SCAN_INTERVAL_MS 3000UL

int g_sda = DEFAULT_SDA;
int g_scl = DEFAULT_SCL;

unsigned long g_lastBlink = 0;
unsigned long g_lastScan = 0;
bool g_ledState = false;

// Pull one integer field like "sda":4 out of a flat JSON object string.
// Hand-rolled on purpose — see the file header on why this stays
// dependency-free instead of pulling in ArduinoJson for two integers.
bool extractIntField(const String &json, const char *key, int *out) {
  String needle = String("\"") + key + "\"";
  int keyIdx = json.indexOf(needle);
  if (keyIdx < 0) return false;
  int colonIdx = json.indexOf(':', keyIdx + needle.length());
  if (colonIdx < 0) return false;
  int i = colonIdx + 1;
  while (i < (int)json.length() && json[i] == ' ') i++;
  int start = i;
  while (i < (int)json.length() && isDigit(json[i])) i++;
  if (i == start) return false; // no digits found after the colon
  *out = json.substring(start, i).toInt();
  return true;
}

// Read Serial for up to windowMs looking for one '\n'-terminated line.
// Returns "" if the window elapses without a complete, non-blank line.
String readLineWithTimeout(unsigned long windowMs) {
  String line = "";
  unsigned long deadline = millis() + windowMs;
  while (millis() < deadline) {
    while (Serial.available()) {
      char c = (char)Serial.read();
      if (c == '\n') {
        line.trim();
        if (line.length() > 0) return line;
        line = ""; // stray blank line — keep waiting inside the window
        continue;
      }
      if (c != '\r') line += c;
    }
  }
  return "";
}

void i2cScan() {
  byte count = 0;
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
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LED_OFF);

  Serial.begin(115200);
  // Native-USB boards need a moment for the host to open the CDC connection;
  // bounded so a UART-bridge board (where Serial is always "ready") never
  // waits here at all.
  unsigned long usbDeadline = millis() + 800;
  while (!Serial && millis() < usbDeadline) { /* wait for USB, bounded */ }
  delay(200);

  String cfgLine = readLineWithTimeout(CONFIG_WINDOW_MS);
  if (cfgLine.length() > 0) {
    int sda, scl;
    if (extractIntField(cfgLine, "sda", &sda)) g_sda = sda;
    if (extractIntField(cfgLine, "scl", &scl)) g_scl = scl;
  }

  Wire.begin(g_sda, g_scl);

  // Confirms to the browser that config parsing took (or fell back to
  // defaults) — printed exactly once, never repeated in loop().
  Serial.print("FORGE-DIAG v1 sda=");
  Serial.print(g_sda);
  Serial.print(" scl=");
  Serial.println(g_scl);
}

void loop() {
  unsigned long now = millis();

  if (now - g_lastBlink >= BLINK_INTERVAL_MS) {
    g_lastBlink = now;
    g_ledState = !g_ledState;
    digitalWrite(LED_PIN, g_ledState ? LED_ON : LED_OFF);
  }

  if (now - g_lastScan >= SCAN_INTERVAL_MS) {
    g_lastScan = now;
    i2cScan();
  }
}

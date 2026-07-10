/**
 * Beginner glossary — the audience "doesn't know what a pull-up resistor is."
 * Terms surface as tap-popovers wherever jargon appears (step text, part rows).
 */

export const GLOSSARY: Record<string, string> = {
  "i2c": "A way for components to talk to each other using just 2 wires (SDA and SCL). Very common for displays and sensors. Your board sends data; the component responds.",
  "spi": "A faster way for components to communicate using 4 wires. Used for SD cards, some displays, and high-speed sensors.",
  "uart": "The simplest communication — one wire sends, one receives. Used for GPS modules, some sensors, and debugging.",
  "gpio": "General Purpose Input/Output — a pin on your board that you can control. Think of it like a light switch or a sensor that the board can turn on/off or read.",
  "sda": "Serial Data — the wire that carries the actual information in an I2C connection. One of the two I2C wires.",
  "scl": "Serial Clock — the wire that keeps timing in an I2C connection. Like a metronome keeping the data in sync.",
  "ssd1306": "The chip inside most small OLED displays. It controls the pixels. If you search for 'SSD1306 OLED', you'll find the right display.",
  "esp32": "A tiny, cheap computer with WiFi and Bluetooth built in. Popular for DIY projects because it's powerful and costs under $5.",
  "esp32-c3": "A newer, smaller version of the ESP32. Uses less power. Great for battery-powered projects.",
  "tp4056": "A charging chip for lithium batteries. Automatically stops charging when full so the battery doesn't overheat or catch fire.",
  "sht31d": "A precise temperature and humidity sensor. More accurate than the cheaper DHT11/DHT22 sensors.",
  "16340": "A size of lithium battery — 16mm wide, 34mm long. About the size of a AA battery but rechargeable and 3.7 volts.",
  "18650": "A larger lithium battery — 18mm wide, 65mm long. Common in laptops and power banks. Holds more power than a 16340.",
  "jst": "A type of small white plastic connector. Common on batteries and small electronics. They click into place so they don't come loose.",
  "dupont": "The little black rectangular connectors used on breadboard jumper wires. Named after the company that invented them.",
  "bms": "Battery Management System — a safety circuit that prevents overcharging, over-discharging, and short circuits. Essential for lithium batteries.",
  "solder bridge": "An accidental blob of solder connecting two pads that should stay separate — the most common cause of shorts. Fix by reheating and wicking the excess away.",
  "tinning": "Melting a thin coat of solder onto a wire tip or pad before joining. Makes the real joint quick and strong.",
  "polarity": "Which side is + and which is −. Reversing polarity on power connections can destroy components instantly.",
  "heat-shrink": "Plastic tubing that shrinks tight around a joint when warmed — insulation that can't peel off like tape.",
  "pull-up resistor": "A resistor that gently holds a signal wire at a known voltage so it doesn't float randomly. I2C needs them; most modules include them already.",
  "multimeter": "The measuring tool for volts, continuity, and resistance. Your 'is it actually connected?' truth machine.",
};

export function glossaryTip(term: string): string | null {
  const key = term.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(GLOSSARY)) {
    const kNorm = k.replace(/[^a-z0-9]/g, "");
    if (key.includes(kNorm) || kNorm.includes(key)) return v;
  }
  return null;
}

interface GlossarySegment {
  text: string;
  tip?: string;
}

const TERM_PATTERN = new RegExp(
  `\\b(${Object.keys(GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "gi"
);

/**
 * Split text into plain/tip segments — each glossary term (first occurrence
 * only) becomes a segment carrying its definition for popover rendering.
 */
export function glossarySegments(text: string): GlossarySegment[] {
  const segments: GlossarySegment[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    const term = m[0];
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: text.slice(last, idx) });
    segments.push({ text: term, tip: GLOSSARY[key] ?? glossaryTip(term) ?? undefined });
    last = idx + term.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.length ? segments : [{ text }];
}

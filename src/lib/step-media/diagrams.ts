/**
 * Hand-authored instructional SVGs — one action per diagram. HTML fragments
 * (no XML prolog).
 *
 * Same sheet language as the wiring sheet (circuit-diagram.ts): ink on paper
 * (DESIGN.md tokens), native-pixel output (width/height = viewBox 1:1, so
 * text never scales below its authored size), hosts scroll horizontally
 * instead of squishing. Typography floor 11px; material/safety colors stay
 * literal (brass, amber charger boards, polarity red); the one accent is the
 * blueprint cyan.
 */
import { escAttr, escText, markerDefs } from "./svg-util";
import { WIRE_NAME_HEX } from "@/lib/wire-colors";

/** Sheet palette — DESIGN.md tokens, inlined (SVG strings can't use CSS). */
const INK = "#1a2744";
const INK_SECONDARY = "#4a5568";
const INK_MUTED = "#5c6b7a";
const PAPER = "#ffffff";
const SHEET_BORDER = "#d4cfc5";
const ACCENT = "#0e7490";
const ACCENT_DEEP = "#155e75";
const ACCENT_SOFT = "#ecfeff";
const DANGER = "#dc2626";
/** Text on dark board surfaces (OLED glass etc.) — light, never saturated. */
const ON_DARK = "#e2e8f0";
const ON_DARK_MUTED = "#94a3b8";

export function svgOledDesolder(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280" role="img" aria-label="Remove OLED header pins">
  <rect width="400" height="280" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Remove the black header from the OLED</text>
  <!-- OLED board -->
  <rect x="40" y="50" width="200" height="130" rx="8" fill="#0b1220" stroke="#334155" stroke-width="2"/>
  <rect x="55" y="65" width="170" height="70" rx="3" fill="#020617"/>
  <text x="140" y="105" text-anchor="middle" fill="${ON_DARK}" font-family="ui-monospace,monospace" font-size="18" font-weight="700">OLED</text>
  <text x="140" y="125" text-anchor="middle" fill="${ON_DARK_MUTED}" font-size="11" font-family="system-ui,sans-serif">0.96" · face down</text>
  <!-- 4 pins with header -->
  <rect x="70" y="145" width="140" height="22" rx="3" fill="#1e293b" stroke="#475569"/>
  ${[0, 1, 2, 3]
    .map(
      (i) =>
        `<rect x="${85 + i * 32}" y="150" width="10" height="28" rx="1" fill="#94a3b8"/><circle cx="${90 + i * 32}" cy="185" r="3" fill="#fbbf24"/>`
    )
    .join("")}
  <!-- Iron -->
  <g transform="translate(270,80)">
    <rect x="0" y="40" width="70" height="18" rx="4" fill="#78716c"/>
    <rect x="55" y="20" width="14" height="50" rx="2" fill="#a8a29e"/>
    <path d="M62 20 L68 0 L76 20 Z" fill="#f97316"/>
    <text x="35" y="75" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}" font-family="system-ui,sans-serif">Iron ~350°C</text>
  </g>
  <path d="M250 160 Q260 150 270 140" stroke="#f97316" stroke-width="2" fill="none" stroke-dasharray="4 2"/>
  <text x="200" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="${INK}">After: four clean holes</text>
  ${["GND", "VCC", "SCL", "SDA"]
    .map(
      (lab, i) =>
        `<rect x="${90 + i * 50}" y="240" width="36" height="20" rx="3" fill="#fef3c7" stroke="#d97706"/><text x="${108 + i * 50}" y="254" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace" fill="#92400e">${lab}</text>`
    )
    .join("")}
</svg>`;
}

export function svgWireBendFrame(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="400" height="280" role="img" aria-label="Bend brass wire frame">
  <rect width="400" height="280" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Bend brass wire into a rectangle</text>
  <!-- straight wire with marks -->
  <line x1="40" y1="70" x2="360" y2="70" stroke="#b8860b" stroke-width="4" stroke-linecap="round"/>
  ${[0, 8, 14, 22, 30]
    .map((cm, i) => {
      const x = 40 + (cm / 30) * 320;
      return `<line x1="${x}" y1="60" x2="${x}" y2="80" stroke="${DANGER}" stroke-width="2"/><text x="${x}" y="55" text-anchor="middle" font-size="11" fill="${DANGER}" font-family="ui-monospace,monospace">${cm}cm</text>`;
    })
    .join("")}
  <text x="200" y="100" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}" font-family="system-ui,sans-serif">Mark · then bend 90° at each red mark</text>
  <!-- resulting frame -->
  <rect x="100" y="130" width="200" height="110" fill="none" stroke="#b8860b" stroke-width="5" rx="2"/>
  <text x="200" y="190" text-anchor="middle" font-size="12" fill="#92400e" font-family="system-ui,sans-serif">~8 cm</text>
  <text x="85" y="190" text-anchor="middle" font-size="11" fill="#92400e" transform="rotate(-90 85 190)">~6 cm</text>
  <text x="200" y="265" text-anchor="middle" font-size="11" fill="${INK}" font-family="system-ui,sans-serif">Done: closed rectangle that sits flat</text>
</svg>`;
}

export function svgCutJumpers(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220" role="img" aria-label="Cut brass jumpers">
  <rect width="400" height="220" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Cut four short brass pieces (~3 cm)</text>
  ${[0, 1, 2, 3]
    .map(
      (i) =>
        `<line x1="60" y1="${60 + i * 35}" x2="200" y2="${60 + i * 35}" stroke="#b8860b" stroke-width="3.5" stroke-linecap="round"/>
         <text x="220" y="${65 + i * 35}" font-size="12" fill="${INK_SECONDARY}" font-family="ui-monospace,monospace">3 cm</text>`
    )
    .join("")}
  <g transform="translate(300,80)">
    <path d="M0 40 L40 10 L50 20 L20 55 Z" fill="${INK_MUTED}"/>
    <text x="25" y="75" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}">Cutters</text>
  </g>
  <text x="200" y="205" text-anchor="middle" font-size="11" font-weight="600" fill="${INK}">Wear eye protection — ends can fly</text>
</svg>`;
}

export function svgBatteryPoles(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240" role="img" aria-label="Battery plus and minus">
  <rect width="400" height="240" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Find + and − before you wire anything</text>
  <!-- cell -->
  <rect x="50" y="70" width="120" height="50" rx="25" fill="#334155" stroke="${INK}" stroke-width="2"/>
  <rect x="148" y="78" width="18" height="34" rx="4" fill="#f8fafc"/>
  <text x="157" y="100" text-anchor="middle" fill="${DANGER}" font-size="14" font-weight="700">+</text>
  <text x="60" y="145" text-anchor="middle" font-size="11" fill="${INK}" font-weight="600">− end (flat)</text>
  <text x="160" y="145" text-anchor="middle" font-size="11" fill="${DANGER}" font-weight="600">+ end (button)</text>
  <!-- TP4056 -->
  <rect x="220" y="60" width="140" height="100" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <text x="290" y="85" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">TP4056</text>
  <text x="250" y="115" font-size="11" fill="${DANGER}" font-family="ui-monospace,monospace">BAT+ / B+</text>
  <text x="250" y="140" font-size="11" fill="${INK}" font-family="ui-monospace,monospace">BAT− / B−</text>
  <text x="200" y="210" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}">Red → + only · Black → − only · No USB yet</text>
</svg>`;
}

export function svgTouchMount(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240" role="img" aria-label="Mount touch switch">
  <rect width="400" height="240" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Place the touch pad where you will tap</text>
  <rect x="100" y="50" width="200" height="120" rx="6" fill="none" stroke="#b8860b" stroke-width="4"/>
  <circle cx="200" cy="70" r="22" fill="#cffafe" stroke="${ACCENT}" stroke-width="2"/>
  <circle cx="200" cy="70" r="12" fill="#67e8f9" opacity="0.7"/>
  <text x="200" y="115" text-anchor="middle" font-size="12" fill="${ACCENT_DEEP}" font-weight="600">TOP of frame (recommended)</text>
  <text x="80" y="160" font-size="11" fill="${INK_MUTED}" font-family="ui-monospace,monospace">Pads: VCC · GND · I/O</text>
  ${markerDefs("sm-arr-touch", ACCENT)}
  <path d="M200 95 L200 130" stroke="${ACCENT}" stroke-width="1.5" marker-end="url(#sm-arr-touch)"/>
  <text x="200" y="210" text-anchor="middle" font-size="12" fill="${INK}">Tape lightly first — glue after wires fit</text>
</svg>`;
}

export function svgI2cWiring(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300" width="420" height="300" role="img" aria-label="I2C wiring">
  <rect width="420" height="300" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="210" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Wire power + I2C (colors matter)</text>
  <!-- ESP32 -->
  <rect x="30" y="50" width="100" height="140" rx="6" fill="${ACCENT_SOFT}" stroke="${ACCENT}" stroke-width="2"/>
  <text x="80" y="75" text-anchor="middle" font-weight="700" font-size="12" fill="${ACCENT_DEEP}">ESP32-C3</text>
  <text x="45" y="105" font-size="11" fill="${WIRE_NAME_HEX.red}" font-family="ui-monospace,monospace">3V3</text>
  <text x="45" y="130" font-size="11" fill="${WIRE_NAME_HEX.black}" font-family="ui-monospace,monospace">GND</text>
  <text x="45" y="155" font-size="11" fill="${WIRE_NAME_HEX.blue}" font-family="ui-monospace,monospace">GPIO4 SDA</text>
  <text x="45" y="180" font-size="11" fill="${WIRE_NAME_HEX.yellow}" font-family="ui-monospace,monospace">GPIO5 SCL</text>
  <!-- OLED -->
  <rect x="280" y="50" width="110" height="140" rx="6" fill="#0b1220" stroke="${ON_DARK_MUTED}" stroke-width="2"/>
  <text x="335" y="75" text-anchor="middle" font-weight="700" font-size="12" fill="${ON_DARK}">OLED</text>
  <text x="295" y="105" font-size="11" fill="#fca5a5" font-family="ui-monospace,monospace">VCC</text>
  <text x="295" y="130" font-size="11" fill="${ON_DARK}" font-family="ui-monospace,monospace">GND</text>
  <text x="295" y="155" font-size="11" fill="#93c5fd" font-family="ui-monospace,monospace">SDA</text>
  <text x="295" y="180" font-size="11" fill="#fde047" font-family="ui-monospace,monospace">SCL</text>
  <!-- wires -->
  <line x1="130" y1="100" x2="280" y2="100" stroke="${WIRE_NAME_HEX.red}" stroke-width="3"/>
  <line x1="130" y1="125" x2="280" y2="125" stroke="${WIRE_NAME_HEX.black}" stroke-width="3"/>
  <line x1="130" y1="150" x2="280" y2="150" stroke="${WIRE_NAME_HEX.blue}" stroke-width="3"/>
  <line x1="130" y1="175" x2="280" y2="175" stroke="${WIRE_NAME_HEX.yellow}" stroke-width="3"/>
  <text x="210" y="95" text-anchor="middle" font-size="11" fill="${WIRE_NAME_HEX.red}">red 3.3V</text>
  <text x="210" y="220" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}">Never put OLED VCC on 5V</text>
  <text x="210" y="245" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}">Same four wires to the sensor if you have one</text>
  <text x="210" y="280" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}">Black = shared ground on every board</text>
</svg>`;
}

export function svgUsbUpload(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220" role="img" aria-label="USB upload">
  <rect width="400" height="220" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Plug in USB and upload Blink first</text>
  <rect x="40" y="50" width="120" height="80" rx="8" fill="${ACCENT_SOFT}" stroke="${ACCENT}" stroke-width="2"/>
  <text x="100" y="95" text-anchor="middle" font-size="12" fill="${ACCENT_DEEP}">ESP32-C3</text>
  <rect x="160" y="80" width="80" height="12" rx="2" fill="${INK_MUTED}"/>
  <rect x="260" y="50" width="100" height="80" rx="6" fill="#f1f5f9" stroke="#94a3b8"/>
  <text x="310" y="95" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}">Computer</text>
  <text x="200" y="170" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}">Board + port correct → Upload → Success</text>
  <text x="200" y="195" text-anchor="middle" font-size="11" fill="${INK_SECONDARY}">Then I2C scanner to see address 0x3C</text>
</svg>`;
}

export function svgSolarMount(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240" role="img" aria-label="Solar panel mount">
  <rect width="400" height="240" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Panel + goes to charger IN+</text>
  <rect x="40" y="50" width="140" height="90" rx="4" fill="${INK}" stroke="#334155" stroke-width="2"/>
  ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${50 + c * 30}" y="${60 + r * 25}" width="26" height="20" fill="#1e3a5f" stroke="#475569"/>`).join("")).join("")}
  <text x="110" y="160" text-anchor="middle" font-size="11" fill="${DANGER}">+  red</text>
  <text x="110" y="178" text-anchor="middle" font-size="11" fill="${INK}">−  black</text>
  ${markerDefs("sm-arr-solar", INK_MUTED)}
  <path d="M190 95 L230 95" stroke="${INK_MUTED}" stroke-width="2" marker-end="url(#sm-arr-solar)"/>
  <rect x="240" y="60" width="120" height="80" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <text x="300" y="95" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">Charger</text>
  <text x="300" y="120" text-anchor="middle" font-size="11" fill="${DANGER}">IN+</text>
  <text x="300" y="138" text-anchor="middle" font-size="11" fill="${INK}">IN−</text>
  <text x="200" y="215" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}">Mount where light can hit the cells</text>
</svg>`;
}

export function svgBambooDrill(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240" role="img" aria-label="Bamboo base">
  <rect width="400" height="240" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Prepare the bamboo coaster base</text>
  <ellipse cx="200" cy="130" rx="100" ry="70" fill="#d4b483" stroke="#8b6914" stroke-width="2"/>
  <ellipse cx="200" cy="130" rx="12" ry="12" fill="#fef3c7" stroke="${DANGER}" stroke-width="2"/>
  <text x="200" y="135" text-anchor="middle" font-size="11" fill="${DANGER}">center</text>
  <text x="200" y="220" text-anchor="middle" font-size="12" font-weight="600" fill="${INK}">Mark center · drill small hole if needed · sand flat</text>
</svg>`;
}

export function svgFinalAssembly(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260" role="img" aria-label="Final assembly">
  <rect width="400" height="260" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="${INK}">Seat frame on base · screen facing you</text>
  <ellipse cx="200" cy="210" rx="110" ry="25" fill="#d4b483" stroke="#8b6914"/>
  <rect x="120" y="70" width="160" height="90" fill="none" stroke="#b8860b" stroke-width="5"/>
  <rect x="145" y="90" width="110" height="50" rx="4" fill="#0b1220"/>
  <text x="200" y="120" text-anchor="middle" fill="${ON_DARK}" font-size="14">12:42</text>
  <text x="200" y="250" text-anchor="middle" font-size="12" fill="${INK}">No pinched wires · nothing rattling</text>
</svg>`;
}

export function svgGenericChecklist(title: string): string {
  const t = escText(title.slice(0, 40));
  const a = escAttr(title.slice(0, 40));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200" role="img" aria-label="${a}">
  <rect width="400" height="200" rx="12" fill="${PAPER}" stroke="${SHEET_BORDER}"/>
  <text x="200" y="40" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="${INK}">${t}</text>
  <rect x="80" y="70" width="28" height="28" rx="6" fill="${ACCENT}"/>
  <text x="94" y="90" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">1</text>
  <text x="130" y="90" font-size="13" fill="${INK_SECONDARY}">Gather the "You need" items</text>
  <rect x="80" y="115" width="28" height="28" rx="6" fill="${ACCENT}"/>
  <text x="94" y="135" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">2</text>
  <text x="130" y="135" font-size="13" fill="${INK_SECONDARY}">Follow each numbered action on the right</text>
  <rect x="80" y="160" width="28" height="28" rx="6" fill="#16a34a"/>
  <text x="94" y="180" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">✓</text>
  <text x="130" y="180" font-size="13" fill="${INK_SECONDARY}">Stop when "Done when" matches your bench</text>
</svg>`;
}

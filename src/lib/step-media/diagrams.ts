/** Hand-authored instructional SVGs — one action per diagram. */

export function svgOledDesolder(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="100%" height="100%" role="img" aria-label="Remove OLED header pins">
  <rect width="400" height="280" fill="#f8fafc"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Remove the black header from the OLED</text>
  <!-- OLED board -->
  <rect x="40" y="50" width="200" height="130" rx="8" fill="#0b1220" stroke="#334155" stroke-width="2"/>
  <rect x="55" y="65" width="170" height="70" rx="3" fill="#020617"/>
  <text x="140" y="105" text-anchor="middle" fill="#67e8f9" font-family="ui-monospace,monospace" font-size="18" font-weight="700">OLED</text>
  <text x="140" y="125" text-anchor="middle" fill="#64748b" font-size="10" font-family="system-ui,sans-serif">0.96" · face down</text>
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
    <text x="35" y="75" text-anchor="middle" font-size="10" fill="#57534e" font-family="system-ui,sans-serif">Iron ~350°C</text>
  </g>
  <path d="M250 160 Q260 150 270 140" stroke="#f97316" stroke-width="2" fill="none" stroke-dasharray="4 2"/>
  <text x="200" y="230" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="600" fill="#0f172a">After: four clean holes</text>
  ${["GND", "VCC", "SCL", "SDA"]
    .map(
      (lab, i) =>
        `<rect x="${90 + i * 50}" y="240" width="36" height="20" rx="3" fill="#fef3c7" stroke="#d97706"/><text x="${108 + i * 50}" y="254" text-anchor="middle" font-size="9" font-family="ui-monospace,monospace" fill="#92400e">${lab}</text>`
    )
    .join("")}
</svg>`;
}

export function svgWireBendFrame(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 280" width="100%" height="100%" role="img" aria-label="Bend brass wire frame">
  <rect width="400" height="280" fill="#fffbeb"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Bend brass wire into a rectangle</text>
  <!-- straight wire with marks -->
  <line x1="40" y1="70" x2="360" y2="70" stroke="#b8860b" stroke-width="4" stroke-linecap="round"/>
  ${[0, 8, 14, 22, 30]
    .map((cm, i) => {
      const x = 40 + (cm / 30) * 320;
      return `<line x1="${x}" y1="60" x2="${x}" y2="80" stroke="#dc2626" stroke-width="2"/><text x="${x}" y="55" text-anchor="middle" font-size="9" fill="#dc2626" font-family="ui-monospace,monospace">${cm}cm</text>`;
    })
    .join("")}
  <text x="200" y="100" text-anchor="middle" font-size="11" fill="#57534e" font-family="system-ui,sans-serif">Mark · then bend 90° at each red mark</text>
  <!-- resulting frame -->
  <rect x="100" y="130" width="200" height="110" fill="none" stroke="#b8860b" stroke-width="5" rx="2"/>
  <text x="200" y="190" text-anchor="middle" font-size="12" fill="#92400e" font-family="system-ui,sans-serif">~8 cm</text>
  <text x="85" y="190" text-anchor="middle" font-size="11" fill="#92400e" transform="rotate(-90 85 190)">~6 cm</text>
  <text x="200" y="265" text-anchor="middle" font-size="11" fill="#0f172a" font-family="system-ui,sans-serif">Done: closed rectangle that sits flat</text>
</svg>`;
}

export function svgCutJumpers(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="100%" height="100%" role="img" aria-label="Cut brass jumpers">
  <rect width="400" height="220" fill="#f8fafc"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Cut four short brass pieces (~3 cm)</text>
  ${[0, 1, 2, 3]
    .map(
      (i) =>
        `<line x1="60" y1="${60 + i * 35}" x2="200" y2="${60 + i * 35}" stroke="#b8860b" stroke-width="3.5" stroke-linecap="round"/>
         <text x="220" y="${65 + i * 35}" font-size="12" fill="#57534e" font-family="ui-monospace,monospace">3 cm</text>`
    )
    .join("")}
  <g transform="translate(300,80)">
    <path d="M0 40 L40 10 L50 20 L20 55 Z" fill="#64748b"/>
    <text x="25" y="75" text-anchor="middle" font-size="10" fill="#57534e">Cutters</text>
  </g>
  <text x="200" y="205" text-anchor="middle" font-size="11" fill="#0f172a">Wear eye protection — ends can fly</text>
</svg>`;
}

export function svgBatteryPoles(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" role="img" aria-label="Battery plus and minus">
  <rect width="400" height="240" fill="#fdf2f8"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Find + and − before you wire anything</text>
  <!-- cell -->
  <rect x="50" y="70" width="120" height="50" rx="25" fill="#334155" stroke="#0f172a" stroke-width="2"/>
  <rect x="55" y="78" width="22" height="34" rx="4" fill="#f8fafc"/>
  <text x="130" y="100" text-anchor="middle" fill="#e2e8f0" font-size="14" font-weight="700">+</text>
  <text x="70" y="145" text-anchor="middle" font-size="11" fill="#dc2626" font-weight="600">+ end (button)</text>
  <text x="150" y="145" text-anchor="middle" font-size="11" fill="#0f172a" font-weight="600">− end (flat)</text>
  <!-- TP4056 -->
  <rect x="220" y="60" width="140" height="100" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <text x="290" y="85" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">TP4056</text>
  <text x="250" y="115" font-size="11" fill="#dc2626" font-family="ui-monospace,monospace">BAT+ / B+</text>
  <text x="250" y="140" font-size="11" fill="#0f172a" font-family="ui-monospace,monospace">BAT− / B−</text>
  <text x="200" y="210" text-anchor="middle" font-size="12" fill="#0f172a">Red → + only · Black → − only · No USB yet</text>
</svg>`;
}

export function svgTouchMount(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" role="img" aria-label="Mount touch switch">
  <rect width="400" height="240" fill="#f5f3ff"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Place the touch pad where you will tap</text>
  <rect x="100" y="50" width="200" height="120" rx="6" fill="none" stroke="#b8860b" stroke-width="4"/>
  <circle cx="200" cy="70" r="22" fill="#ede9fe" stroke="#7c3aed" stroke-width="2"/>
  <circle cx="200" cy="70" r="12" fill="#a78bfa" opacity="0.7"/>
  <text x="200" y="115" text-anchor="middle" font-size="12" fill="#5b21b6" font-weight="600">TOP of frame (recommended)</text>
  <text x="80" y="160" font-size="11" fill="#64748b" font-family="ui-monospace,monospace">Pads: VCC · GND · I/O</text>
  <path d="M200 95 L200 130" stroke="#7c3aed" stroke-width="1.5" marker-end="url(#arr)"/>
  <text x="200" y="210" text-anchor="middle" font-size="12" fill="#0f172a">Tape lightly first — glue after wires fit</text>
</svg>`;
}

export function svgI2cWiring(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300" width="100%" height="100%" role="img" aria-label="I2C wiring">
  <rect width="420" height="300" fill="#f0f9ff"/>
  <text x="210" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Wire power + I2C (colors matter)</text>
  <!-- ESP32 -->
  <rect x="30" y="50" width="100" height="140" rx="6" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <text x="80" y="75" text-anchor="middle" font-weight="700" font-size="12" fill="#0c4a6e">ESP32-C3</text>
  <text x="45" y="105" font-size="10" fill="#dc2626" font-family="ui-monospace,monospace">3V3</text>
  <text x="45" y="130" font-size="10" fill="#0f172a" font-family="ui-monospace,monospace">GND</text>
  <text x="45" y="155" font-size="10" fill="#2563eb" font-family="ui-monospace,monospace">GPIO4 SDA</text>
  <text x="45" y="180" font-size="10" fill="#ca8a04" font-family="ui-monospace,monospace">GPIO5 SCL</text>
  <!-- OLED -->
  <rect x="280" y="50" width="110" height="140" rx="6" fill="#0b1220" stroke="#38bdf8" stroke-width="2"/>
  <text x="335" y="75" text-anchor="middle" font-weight="700" font-size="12" fill="#e2e8f0">OLED</text>
  <text x="295" y="105" font-size="10" fill="#fca5a5" font-family="ui-monospace,monospace">VCC</text>
  <text x="295" y="130" font-size="10" fill="#e2e8f0" font-family="ui-monospace,monospace">GND</text>
  <text x="295" y="155" font-size="10" fill="#93c5fd" font-family="ui-monospace,monospace">SDA</text>
  <text x="295" y="180" font-size="10" fill="#fde047" font-family="ui-monospace,monospace">SCL</text>
  <!-- wires -->
  <line x1="130" y1="100" x2="280" y2="100" stroke="#dc2626" stroke-width="3"/>
  <line x1="130" y1="125" x2="280" y2="125" stroke="#0f172a" stroke-width="3"/>
  <line x1="130" y1="150" x2="280" y2="150" stroke="#2563eb" stroke-width="3"/>
  <line x1="130" y1="175" x2="280" y2="175" stroke="#ca8a04" stroke-width="3"/>
  <text x="210" y="95" text-anchor="middle" font-size="9" fill="#dc2626">red 3.3V</text>
  <text x="210" y="220" text-anchor="middle" font-size="12" font-weight="600" fill="#0f172a">Never put OLED VCC on 5V</text>
  <text x="210" y="245" text-anchor="middle" font-size="11" fill="#57534e">Same four wires to the sensor if you have one</text>
  <text x="210" y="280" text-anchor="middle" font-size="11" fill="#0369a1">Black = shared ground on every board</text>
</svg>`;
}

export function svgUsbUpload(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="100%" height="100%" role="img" aria-label="USB upload">
  <rect width="400" height="220" fill="#f8fafc"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Plug in USB and upload Blink first</text>
  <rect x="40" y="50" width="120" height="80" rx="8" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>
  <text x="100" y="95" text-anchor="middle" font-size="12" fill="#0c4a6e">ESP32-C3</text>
  <rect x="160" y="80" width="80" height="12" rx="2" fill="#64748b"/>
  <rect x="260" y="50" width="100" height="80" rx="6" fill="#f1f5f9" stroke="#94a3b8"/>
  <text x="310" y="95" text-anchor="middle" font-size="11" fill="#334155">Computer</text>
  <text x="200" y="170" text-anchor="middle" font-size="12" fill="#0f172a">Board + port correct → Upload → Success</text>
  <text x="200" y="195" text-anchor="middle" font-size="11" fill="#57534e">Then I2C scanner to see address 0x3C</text>
</svg>`;
}

export function svgSolarMount(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" role="img" aria-label="Solar panel mount">
  <rect width="400" height="240" fill="#fffbeb"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Panel + goes to charger IN+</text>
  <rect x="40" y="50" width="140" height="90" rx="4" fill="#0f172a" stroke="#334155" stroke-width="2"/>
  ${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${50 + c * 30}" y="${60 + r * 25}" width="26" height="20" fill="#1e3a5f" stroke="#475569"/>`).join("")).join("")}
  <text x="110" y="160" text-anchor="middle" font-size="11" fill="#dc2626">+  red</text>
  <text x="110" y="178" text-anchor="middle" font-size="11" fill="#0f172a">−  black</text>
  <path d="M190 95 L230 95" stroke="#64748b" stroke-width="2" marker-end="url(#a)"/>
  <rect x="240" y="60" width="120" height="80" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
  <text x="300" y="95" text-anchor="middle" font-size="12" font-weight="700" fill="#92400e">Charger</text>
  <text x="300" y="120" text-anchor="middle" font-size="11" fill="#dc2626">IN+</text>
  <text x="300" y="138" text-anchor="middle" font-size="11" fill="#0f172a">IN−</text>
  <text x="200" y="215" text-anchor="middle" font-size="12" fill="#0f172a">Mount where light can hit the cells</text>
</svg>`;
}

export function svgBambooDrill(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="100%" height="100%" role="img" aria-label="Bamboo base">
  <rect width="400" height="240" fill="#faf6f0"/>
  <text x="200" y="24" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Prepare the bamboo coaster base</text>
  <ellipse cx="200" cy="130" rx="100" ry="70" fill="#d4b483" stroke="#8b6914" stroke-width="2"/>
  <ellipse cx="200" cy="130" rx="12" ry="12" fill="#fef3c7" stroke="#dc2626" stroke-width="2"/>
  <text x="200" y="135" text-anchor="middle" font-size="10" fill="#dc2626">center</text>
  <text x="200" y="220" text-anchor="middle" font-size="12" fill="#0f172a">Mark center · drill small hole if needed · sand flat</text>
</svg>`;
}

export function svgFinalAssembly(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="100%" height="100%" role="img" aria-label="Final assembly">
  <rect width="400" height="260" fill="#f4f1eb"/>
  <text x="200" y="22" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="700" fill="#0f172a">Seat frame on base · screen facing you</text>
  <ellipse cx="200" cy="210" rx="110" ry="25" fill="#d4b483" stroke="#8b6914"/>
  <rect x="120" y="70" width="160" height="90" fill="none" stroke="#b8860b" stroke-width="5"/>
  <rect x="145" y="90" width="110" height="50" rx="4" fill="#0b1220"/>
  <text x="200" y="120" text-anchor="middle" fill="#67e8f9" font-size="14">12:42</text>
  <text x="200" y="250" text-anchor="middle" font-size="12" fill="#0f172a">No pinched wires · nothing rattling</text>
</svg>`;
}

export function svgGenericChecklist(title: string): string {
  const t = title.slice(0, 40);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%" height="100%" role="img" aria-label="${t}">
  <rect width="400" height="200" fill="#f8fafc"/>
  <text x="200" y="40" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="700" fill="#0f172a">${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  <rect x="80" y="70" width="28" height="28" rx="6" fill="#0891b2"/>
  <text x="94" y="90" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">1</text>
  <text x="130" y="90" font-size="13" fill="#334155">Gather the “You need” items</text>
  <rect x="80" y="115" width="28" height="28" rx="6" fill="#0891b2"/>
  <text x="94" y="135" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">2</text>
  <text x="130" y="135" font-size="13" fill="#334155">Follow each numbered action on the right</text>
  <rect x="80" y="160" width="28" height="28" rx="6" fill="#16a34a"/>
  <text x="94" y="180" text-anchor="middle" fill="#fff" font-size="16" font-weight="700">✓</text>
  <text x="130" y="180" font-size="13" fill="#334155">Stop when “Done when” matches your bench</text>
</svg>`;
}

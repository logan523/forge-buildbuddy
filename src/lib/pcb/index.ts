import type { BuildPlan, Part } from "@/lib/types";

export interface NetNode {
  ref: string;
  pin: string;
}

export interface Net {
  name: string;
  nodes: NetNode[];
}

export interface Footprint {
  ref: string;
  catalogId?: string;
  name: string;
  w: number; // mm
  h: number;
  pads: { name: string; x: number; y: number }[];
}

export interface PlacedPart {
  footprint: Footprint;
  x: number;
  y: number;
  rotation: number;
}

export interface RouteSeg {
  net: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: 1 | 2;
}

export interface PcbPackage {
  boardWidth: number;
  boardHeight: number;
  nets: Net[];
  placed: PlacedPart[];
  routes: RouteSeg[];
  unrouted: string[];
  svg: string;
  netlistText: string;
  bomCsv: string;
  kicadNetlist: string;
  jlcpcbUrl: string;
  disclaimer: string;
}

function footprintFor(part: Part, index: number): Footprint {
  const ref = `U${index + 1}`;
  const id = part.catalogId || "";
  const name = part.name;

  if (id === "esp32-c3" || /esp32-?c3/i.test(name)) {
    return {
      ref,
      catalogId: id,
      name,
      w: 22,
      h: 18,
      pads: [
        { name: "3V3", x: -9, y: 6 },
        { name: "GND", x: -9, y: -6 },
        { name: "GPIO0", x: 9, y: 6 },
        { name: "GPIO4", x: 9, y: 2 },
        { name: "GPIO5", x: 9, y: -2 },
        { name: "VIN", x: -9, y: 0 },
      ],
    };
  }
  if (id === "ssd1306-i2c" || /oled|ssd1306/i.test(name)) {
    return {
      ref,
      catalogId: id,
      name,
      w: 27,
      h: 27,
      pads: [
        { name: "VCC", x: -8, y: 12 },
        { name: "GND", x: -2.5, y: 12 },
        { name: "SCL", x: 2.5, y: 12 },
        { name: "SDA", x: 8, y: 12 },
      ],
    };
  }
  if (id === "sht31d" || /sht31/i.test(name)) {
    return {
      ref,
      catalogId: id,
      name,
      w: 15,
      h: 12,
      pads: [
        { name: "VCC", x: -5, y: 5 },
        { name: "GND", x: -1.5, y: 5 },
        { name: "SDA", x: 1.5, y: 5 },
        { name: "SCL", x: 5, y: 5 },
      ],
    };
  }
  if (id === "tp4056-protected" || /tp4056/i.test(name)) {
    return {
      ref,
      catalogId: id,
      name,
      w: 26,
      h: 17,
      pads: [
        { name: "IN+", x: -10, y: 6 },
        { name: "IN-", x: -10, y: -6 },
        { name: "B+", x: 10, y: 6 },
        { name: "B-", x: 10, y: -6 },
      ],
    };
  }
  if (id === "touch-switch" || /touch/i.test(name)) {
    return {
      ref,
      catalogId: id,
      name,
      w: 14,
      h: 14,
      pads: [
        { name: "VCC", x: -4, y: 5 },
        { name: "GND", x: 0, y: 5 },
        { name: "SIG", x: 4, y: 5 },
      ],
    };
  }
  // Generic module
  return {
    ref,
    catalogId: id || undefined,
    name,
    w: 16,
    h: 12,
    pads: [
      { name: "1", x: -5, y: 4 },
      { name: "2", x: 0, y: 4 },
      { name: "3", x: 5, y: 4 },
    ],
  };
}

function parseEndpoint(ep: string): { deviceHint: string; pin: string } {
  const pinMatch =
    ep.match(/(GPIO\s*\d+|3\.?3V|5V|GND|VIN|VCC|SDA|SCL|SIG|OUT|IN\+?|IN-|B\+|B-|BAT\+|BAT-)/i) ||
    ep.match(/\(([^)]+)\)/);
  const pin = pinMatch ? pinMatch[1].replace(/\s+/g, "") : ep.slice(0, 12);
  const deviceHint = ep.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 3).join(" ");
  return { deviceHint: deviceHint.toLowerCase(), pin: pin.toUpperCase().replace(/\s/g, "") };
}

function matchRef(hint: string, parts: { ref: string; name: string; catalogId?: string }[]): string | null {
  const h = hint.toLowerCase();
  for (const p of parts) {
    const n = `${p.name} ${p.catalogId || ""}`.toLowerCase();
    if (h.includes("esp32") && n.includes("esp32")) return p.ref;
    if ((h.includes("oled") || h.includes("display")) && (n.includes("oled") || n.includes("ssd"))) return p.ref;
    if (h.includes("sht") && n.includes("sht")) return p.ref;
    if (h.includes("touch") && n.includes("touch")) return p.ref;
    if ((h.includes("tp4056") || h.includes("charg")) && (n.includes("tp4056") || n.includes("charg"))) return p.ref;
    if (h.includes("solar") && n.includes("solar")) return p.ref;
    if (h.includes("battery") && n.includes("battery")) return p.ref;
  }
  // fuzzy: any word overlap
  for (const p of parts) {
    const words = p.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.some((w) => h.includes(w))) return p.ref;
  }
  return null;
}

export function buildNetlist(plan: BuildPlan): { nets: Net[]; footprints: Footprint[] } {
  const electronic = (plan.parts || []).filter(
    (p) =>
      !/bamboo|brass wire|copper tube|coaster/i.test(p.name) ||
      p.catalogId?.includes("esp") ||
      p.catalogId?.includes("oled")
  );
  // Prefer MCU + modules for PCB; skip pure mechanical
  const pcbParts = (plan.parts || []).filter((p) => {
    const id = p.catalogId || "";
    if (["bamboo-coaster", "brass-wire-1mm", "copper-tube-3mm", "solar-panel-5v", "battery-16340", "battery-18650"].includes(id)) {
      return false;
    }
    return true;
  });

  const footprints = pcbParts.map((p, i) => footprintFor(p, i));
  const meta = footprints.map((f, i) => ({
    ref: f.ref,
    name: pcbParts[i].name,
    catalogId: pcbParts[i].catalogId,
  }));

  const netMap = new Map<string, NetNode[]>();

  (plan.wiringConnections || []).forEach((c, i) => {
    const a = parseEndpoint(c.from);
    const b = parseEndpoint(c.to);
    const refA = matchRef(a.deviceHint + " " + c.from, meta) || "U?";
    const refB = matchRef(b.deviceHint + " " + c.to, meta) || "U?";
    // Power nets by pin name
    let netName = `N$${i}`;
    const pins = `${a.pin} ${b.pin}`;
    if (/GND/.test(pins)) netName = "GND";
    else if (/3\.?3V|3V3/.test(pins)) netName = "3V3";
    else if (/5V/.test(pins)) netName = "5V";
    else if (/SDA/.test(pins)) netName = "SDA";
    else if (/SCL/.test(pins)) netName = "SCL";

    const nodes = netMap.get(netName) || [];
    nodes.push({ ref: refA, pin: a.pin });
    nodes.push({ ref: refB, pin: b.pin });
    netMap.set(netName, nodes);
  });

  const nets: Net[] = [...netMap.entries()].map(([name, nodes]) => {
    // dedupe
    const key = new Set<string>();
    const unique = nodes.filter((n) => {
      const k = `${n.ref}.${n.pin}`;
      if (key.has(k)) return false;
      key.add(k);
      return true;
    });
    return { name, nodes: unique };
  });

  return { nets, footprints };
}

export function placeComponents(footprints: Footprint[]): { placed: PlacedPart[]; boardWidth: number; boardHeight: number } {
  const margin = 5;
  const gap = 4;
  let x = margin;
  let y = margin;
  let rowH = 0;
  const maxW = 80;
  const placed: PlacedPart[] = [];

  for (const fp of footprints) {
    if (x + fp.w + margin > maxW) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    placed.push({ footprint: fp, x: x + fp.w / 2, y: y + fp.h / 2, rotation: 0 });
    x += fp.w + gap;
    rowH = Math.max(rowH, fp.h);
  }

  const boardWidth = Math.max(maxW, ...placed.map((p) => p.x + p.footprint.w / 2 + margin));
  const boardHeight = Math.max(40, y + rowH + margin);
  return { placed, boardWidth, boardHeight };
}

function padAbs(p: PlacedPart, padName: string): { x: number; y: number } | null {
  const pad =
    p.footprint.pads.find((pd) => pd.name.toUpperCase() === padName.toUpperCase()) ||
    p.footprint.pads.find((pd) => padName.toUpperCase().includes(pd.name.toUpperCase())) ||
    p.footprint.pads[0];
  if (!pad) return null;
  return { x: p.x + pad.x, y: p.y + pad.y };
}

/** Simple star-route from first node to others (orthogonal). */
export function autoroute(
  nets: Net[],
  placed: PlacedPart[]
): { routes: RouteSeg[]; unrouted: string[] } {
  const byRef = new Map(placed.map((p) => [p.footprint.ref, p]));
  const routes: RouteSeg[] = [];
  const unrouted: string[] = [];

  for (const net of nets) {
    const points: { x: number; y: number }[] = [];
    for (const n of net.nodes) {
      const part = byRef.get(n.ref);
      if (!part) continue;
      const pt = padAbs(part, n.pin);
      if (pt) points.push(pt);
    }
    if (points.length < 2) {
      if (points.length === 0) unrouted.push(net.name);
      continue;
    }
    const origin = points[0];
    for (let i = 1; i < points.length; i++) {
      const t = points[i];
      // L-route
      routes.push({
        net: net.name,
        x1: origin.x,
        y1: origin.y,
        x2: t.x,
        y2: origin.y,
        layer: 1,
      });
      routes.push({
        net: net.name,
        x1: t.x,
        y1: origin.y,
        x2: t.x,
        y2: t.y,
        layer: net.name === "GND" || net.name === "3V3" ? 2 : 1,
      });
    }
  }
  return { routes, unrouted };
}

export function renderPcbSvg(
  boardWidth: number,
  boardHeight: number,
  placed: PlacedPart[],
  routes: RouteSeg[]
): string {
  const scale = 4;
  const w = boardWidth * scale;
  const h = boardHeight * scale;
  const sx = (x: number) => x * scale;
  const sy = (y: number) => y * scale;

  const parts = placed
    .map((p) => {
      const x = sx(p.x - p.footprint.w / 2);
      const y = sy(p.y - p.footprint.h / 2);
      const pads = p.footprint.pads
        .map(
          (pd) =>
            `<circle cx="${sx(p.x + pd.x)}" cy="${sy(p.y + pd.y)}" r="2.5" fill="#c9a227"/>`
        )
        .join("");
      return `<g>
        <rect x="${x}" y="${y}" width="${p.footprint.w * scale}" height="${p.footprint.h * scale}"
          fill="#1e293b" stroke="#94a3b8" stroke-width="1" rx="2"/>
        <text x="${sx(p.x)}" y="${sy(p.y)}" text-anchor="middle" fill="#e2e8f0" font-size="8" font-family="sans-serif">${p.footprint.ref}</text>
        ${pads}
      </g>`;
    })
    .join("\n");

  const wires = routes
    .map((r) => {
      const color = r.layer === 2 ? "#22c55e" : "#38bdf8";
      return `<line x1="${sx(r.x1)}" y1="${sy(r.y1)}" x2="${sx(r.x2)}" y2="${sy(r.y2)}" stroke="${color}" stroke-width="1.5"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="#0f172a"/>
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="#14532d" stroke="#86efac" stroke-width="2" rx="4"/>
  ${wires}
  ${parts}
  <text x="8" y="${h - 8}" fill="#94a3b8" font-size="9" font-family="sans-serif">Forge preview autoroute — verify in KiCad before fab</text>
</svg>`;
}

export function generatePcbPackage(plan: BuildPlan): PcbPackage {
  const { nets, footprints } = buildNetlist(plan);
  const { placed, boardWidth, boardHeight } = placeComponents(footprints);
  const { routes, unrouted } = autoroute(nets, placed);
  const svg = renderPcbSvg(boardWidth, boardHeight, placed, routes);

  const netlistText = nets
    .map((n) => `${n.name}: ${n.nodes.map((x) => `${x.ref}.${x.pin}`).join(" ")}`)
    .join("\n");

  const bomCsv = [
    "Ref,Name,Specification,Qty",
    ...(plan.parts || []).map(
      (p, i) => `"U${i + 1}","${p.name.replace(/"/g, '""')}","${(p.specification || "").replace(/"/g, '""')}",${p.quantity}`
    ),
  ].join("\n");

  const kicadNetlist = `(export (version D)
  (design (source "forge") (date "${new Date().toISOString()}"))
  (components
${footprints.map((f) => `    (comp (ref ${f.ref}) (value "${f.name.replace(/"/g, "")}"))`).join("\n")}
  )
  (nets
${nets
  .map(
    (n, i) =>
      `    (net (code ${i + 1}) (name "${n.name}")\n${n.nodes
        .map((node) => `      (node (ref ${node.ref}) (pin ${node.pin}))`)
        .join("\n")}\n    )`
  )
  .join("\n")}
  )
)`;

  return {
    boardWidth,
    boardHeight,
    nets,
    placed,
    routes,
    unrouted,
    svg,
    netlistText,
    bomCsv,
    kicadNetlist,
    jlcpcbUrl: "https://cart.jlcpcb.com/quote",
    disclaimer:
      "Preview autoroute for education. Not fab-certified. Re-open in KiCad/EasyEDA, run DRC, then export Gerbers for JLCPCB.",
  };
}

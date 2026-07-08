/** Shared SVG gradient defs for product forms. */

export function productPaletteDefs(): string {
  return `
  <defs>
    <linearGradient id="pvBamboo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8d4a8"/>
      <stop offset="55%" stop-color="#d4b483"/>
      <stop offset="100%" stop-color="#b8956a"/>
    </linearGradient>
    <linearGradient id="pvBrass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0d78c"/>
      <stop offset="100%" stop-color="#b8860b"/>
    </linearGradient>
    <linearGradient id="pvCopper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e8a87c"/>
      <stop offset="100%" stop-color="#b87333"/>
    </linearGradient>
    <linearGradient id="pvSolar" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="pvPla" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#e7e5e4"/>
      <stop offset="100%" stop-color="#a8a29e"/>
    </linearGradient>
    <linearGradient id="pvMetal" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#cbd5e1"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>
    <filter id="pvSoft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity="0.12"/>
    </filter>
  </defs>`;
}

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function paintAttrs(
  paint: "ghost" | "placed" | "highlight"
): { opacity: number; extra: string } {
  if (paint === "ghost") return { opacity: 0.18, extra: ' stroke-dasharray="4 3"' };
  if (paint === "highlight")
    return { opacity: 1, extra: ' stroke="#0891b2" stroke-width="2.5"' };
  return { opacity: 0.92, extra: "" };
}

/** Shared SVG helpers for hands-on diagrams (HTML-safe fragments). */

export function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Arrow marker defs — unique id per diagram to avoid collisions. */
export function markerDefs(id: string, color = "#64748b"): string {
  return `<defs>
  <marker id="${escAttr(id)}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
    <path d="M0,0 L6,3 L0,6 Z" fill="${escAttr(color)}"/>
  </marker>
</defs>`;
}

/**
 * Normalize SVG for HTML inject:
 * - strip XML prolog
 * - force width 100%; omit height so viewBox drives aspect ratio
 *   (height="auto" is invalid SVG length and spams console errors)
 */
export function normalizeSvgForHtml(svg: string): string {
  let s = svg.trim();
  s = s.replace(/^<\?xml[^?]*\?>\s*/i, "");
  s = s.replace(/<!DOCTYPE[^>]*>\s*/i, "");
  if (/<svg\b/i.test(s)) {
    s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
      const a = attrs
        .replace(/\swidth="[^"]*"/gi, "")
        .replace(/\sheight="[^"]*"/gi, "");
      return `<svg${a} width="100%" preserveAspectRatio="xMidYMid meet">`;
    });
  }
  return s;
}

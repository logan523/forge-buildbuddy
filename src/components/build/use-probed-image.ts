import { useEffect, useState } from "react";

/**
 * True once the image at `src` decodes; false while it is missing or loading.
 * Timing-proof: handlers attach BEFORE src so a cache-synchronous load can't
 * slip past, and a 404 (which can hang before erroring in dev) resolves to
 * false — so a missing photo never flashes a ghost card. Shared by the per-step
 * bench PhotoCard and the per-part identity photo.
 */
export function useProbedImage(src: string): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    // No Image constructor under SSR / test env → treat as "no photo" (null).
    if (!src || typeof Image === "undefined") return;
    let alive = true;
    const probe = new Image();
    probe.onload = () => {
      if (alive && probe.naturalWidth > 0) setLoaded(true);
    };
    probe.onerror = () => {
      if (alive) setLoaded(false);
    };
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) setLoaded(true);
    return () => {
      alive = false;
    };
  }, [src]);
  return loaded;
}

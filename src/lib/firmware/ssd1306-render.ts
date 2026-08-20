/**
 * Renders a 1bpp Adafruit_GFX-format bitmap (the exact byte layout
 * `display.drawBitmap()` consumes) to pixel data — Track B3 (rebuild
 * cycle). Same bit-unpack math already hand-validated this session against
 * real firmware bitmaps (heart/sparkle/rocket/globe/proposal frames): rows
 * are packed MSB-first, `ceil(width / 8)` bytes per row, row-major.
 *
 * Pure — no canvas, no DOM. `src/components/firmware/display-preview.tsx`
 * is the thin canvas-painting shell around this.
 */

export interface RenderedBitmap {
  width: number;
  height: number;
  /** RGBA, row-major, ready for `ImageData`/`putImageData` — on=white, off=black, alpha always 255. */
  pixels: Uint8ClampedArray;
}

export function renderBitmap(bytes: number[], width: number, height: number): RenderedBitmap {
  const bytesPerRow = Math.ceil(width / 8);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let byteIndex = 0; byteIndex < bytesPerRow; byteIndex++) {
      const byte = bytes[y * bytesPerRow + byteIndex] ?? 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIndex * 8 + bit;
        if (x >= width) continue;
        const on = (byte >> (7 - bit)) & 1;
        const v = on ? 255 : 0;
        const idx = (y * width + x) * 4;
        pixels[idx] = v;
        pixels[idx + 1] = v;
        pixels[idx + 2] = v;
        pixels[idx + 3] = 255;
      }
    }
  }
  return { width, height, pixels };
}

/** Reads back a single pixel's on/off state — mainly for tests asserting specific pixels without hand-decoding RGBA offsets. */
export function pixelAt(rendered: RenderedBitmap, x: number, y: number): boolean {
  const idx = (y * rendered.width + x) * 4;
  return rendered.pixels[idx] > 0;
}

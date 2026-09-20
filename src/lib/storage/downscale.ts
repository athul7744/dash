/**
 * Shrinking an image once, when it is stored, instead of every time it is drawn.
 *
 * A card's thumbnail rail is ~176 CSS px, and an `og:image` is routinely 2400 px
 * wide — an 11x reduction the browser has to do on every paint, in one pass,
 * with the cheap filter it reserves for ratios that large. On a banner carrying
 * text that reads as aliasing. Storing a bounded copy makes the ratio small
 * enough for the good filter, and costs a fraction of the bytes to sync.
 *
 * Nothing here is allowed to lose an image: every failure path returns the
 * original blob, so the worst outcome is the picture we already had.
 */

/** Wide enough to stay sharp on a 2x screen at any size a card renders. */
export const THUMBNAIL_MAX_WIDTH = 640;

/** Quality for the re-encoded copy — visually lossless at this size. */
const QUALITY = 0.85;

/**
 * Formats to leave alone.
 *
 * A vector already scales perfectly, and a canvas would rasterise it. A GIF is
 * the one raster format that may be animated, and drawing it to a canvas keeps
 * the first frame and silently drops the rest.
 */
const LEAVE_ALONE = new Set(["image/svg+xml", "image/gif"]);

/** Whether this format can be re-encoded at all without losing something. */
export function isDownscalable(mimeType: string): boolean {
  return mimeType.startsWith("image/") && !LEAVE_ALONE.has(mimeType);
}

/** Whether an image of this type and width is worth re-encoding smaller. */
export function shouldDownscale(mimeType: string, width: number, maxWidth = THUMBNAIL_MAX_WIDTH): boolean {
  return isDownscalable(mimeType) && width > maxWidth;
}

/** The size to draw at, keeping the aspect ratio and never enlarging. */
export function scaledSize(
  width: number,
  height: number,
  maxWidth = THUMBNAIL_MAX_WIDTH,
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.max(1, Math.round((height * maxWidth) / width)) };
}

/**
 * Widths to step through on the way down.
 *
 * Halving repeatedly and only then landing on the target keeps detail that a
 * single big jump throws away — the same reason mipmaps exist. A 2400px banner
 * goes 1200 → 640 rather than straight to 640.
 */
export function downscaleSteps(width: number, maxWidth = THUMBNAIL_MAX_WIDTH): number[] {
  const steps: number[] = [];
  let current = width;
  while (current / 2 > maxWidth) {
    current = Math.round(current / 2);
    steps.push(current);
  }
  steps.push(maxWidth);
  return steps;
}

/**
 * Return a bounded copy of `blob`, or the original when there is nothing to do
 * or no way to do it (an image already small enough, a format left alone, a
 * server runtime with no canvas, a decode failure).
 */
export async function downscaleImage(blob: Blob, maxWidth = THUMBNAIL_MAX_WIDTH): Promise<Blob> {
  if (!isDownscalable(blob.type)) return blob;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return blob;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    if (!shouldDownscale(blob.type, bitmap.width, maxWidth)) return blob;

    let source: ImageBitmap | HTMLCanvasElement = bitmap;
    let { width, height } = bitmap;

    for (const stepWidth of downscaleSteps(bitmap.width, maxWidth)) {
      const size = scaledSize(width, height, stepWidth);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(source, 0, 0, size.width, size.height);
      source = canvas;
      width = size.width;
      height = size.height;
    }

    const canvas = source as HTMLCanvasElement;
    const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    // Kept even if it encodes larger than the original: this exists for the
    // pixel dimensions, and the original still draws at its full size.
    return encoded && encoded.size > 0 ? encoded : blob;
  } catch {
    return blob;
  } finally {
    bitmap?.close?.();
  }
}

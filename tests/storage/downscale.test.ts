/// <reference types="vitest/globals" />

/**
 * Deciding how far to shrink a stored image.
 *
 * A thumbnail rail is ~176 CSS px and an og:image is routinely 2400 — a
 * reduction the browser does on every paint, in one pass, with the filter it
 * reserves for ratios that large, which is what makes a banner full of text look
 * ragged. These are the rules behind doing it once instead; the drawing itself
 * needs a canvas and is thin glue over them.
 */

import {
  downscaleImage,
  downscaleSteps,
  isDownscalable,
  scaledSize,
  shouldDownscale,
  THUMBNAIL_MAX_WIDTH,
} from "@/lib/storage/downscale";

describe("isDownscalable", () => {
  it("takes ordinary raster images", () => {
    expect(isDownscalable("image/png")).toBe(true);
    expect(isDownscalable("image/jpeg")).toBe(true);
    expect(isDownscalable("image/webp")).toBe(true);
  });

  it("leaves a vector alone", () => {
    // It already scales perfectly; a canvas would freeze it into pixels.
    expect(isDownscalable("image/svg+xml")).toBe(false);
  });

  it("leaves a GIF alone", () => {
    // The one raster format that may be animated. A canvas keeps frame one and
    // drops the rest without saying so.
    expect(isDownscalable("image/gif")).toBe(false);
  });

  it("is not for things that aren't images", () => {
    expect(isDownscalable("application/pdf")).toBe(false);
    expect(isDownscalable("")).toBe(false);
  });
});

describe("shouldDownscale", () => {
  it("is true only when the image is wider than the bound", () => {
    expect(shouldDownscale("image/png", 2400)).toBe(true);
    expect(shouldDownscale("image/png", THUMBNAIL_MAX_WIDTH)).toBe(false);
    expect(shouldDownscale("image/png", 100)).toBe(false);
  });

  it("never re-encodes a format that would lose something, however wide", () => {
    expect(shouldDownscale("image/gif", 4000)).toBe(false);
    expect(shouldDownscale("image/svg+xml", 4000)).toBe(false);
  });
});

describe("scaledSize", () => {
  it("keeps the aspect ratio", () => {
    // firecrawl.dev's og.png, the image that prompted this.
    expect(scaledSize(2400, 1260, 640)).toEqual({ width: 640, height: 336 });
  });

  it("never enlarges", () => {
    expect(scaledSize(320, 200, 640)).toEqual({ width: 320, height: 200 });
  });

  it("keeps at least one pixel of height for an extreme banner", () => {
    expect(scaledSize(10000, 3, 640).height).toBe(1);
  });
});

describe("downscaleSteps", () => {
  it("halves on the way down rather than jumping", () => {
    // A single 2400 -> 640 jump throws away detail that stepping keeps; this is
    // why mipmaps exist.
    expect(downscaleSteps(2400, 640)).toEqual([1200, 640]);
  });

  it("goes straight there when the jump is already small", () => {
    expect(downscaleSteps(900, 640)).toEqual([640]);
    expect(downscaleSteps(1280, 640)).toEqual([640]);
  });

  it("always ends at the bound", () => {
    for (const width of [700, 1300, 2400, 5000, 12000]) {
      const steps = downscaleSteps(width, 640);
      expect(steps.at(-1)).toBe(640);
      // Each step at most halves, so no single draw is a big reduction.
      let previous = width;
      for (const step of steps) {
        expect(step).toBeGreaterThanOrEqual(previous / 2 - 1);
        previous = step;
      }
    }
  });
});

describe("downscaleImage", () => {
  it("hands back the original when there is no canvas to draw on", async () => {
    // The node test environment, and any server runtime. Losing the image would
    // be far worse than storing it big.
    const blob = new Blob(["x"], { type: "image/png" });
    await expect(downscaleImage(blob)).resolves.toBe(blob);
  });

  it("hands back a format it must not touch", async () => {
    const gif = new Blob(["x"], { type: "image/gif" });
    await expect(downscaleImage(gif)).resolves.toBe(gif);
  });
});

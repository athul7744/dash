import { describe, expect, it } from "vitest";

import {
  DURATION,
  EASE,
  SPRING_SOFT,
  STAGGER_STEP,
  fadeSlideUp,
  popoverPresence,
  staggerContainer,
  staggerItem,
} from "@/lib/shared/motion";

describe("motion tokens", () => {
  it("orders durations fast < base < slow", () => {
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.slow);
  });

  it("exposes cubic-bezier easings as 4-point tuples", () => {
    expect(EASE.standard).toEqual([0.2, 0.9, 0.2, 1]);
    expect(EASE.exit).toHaveLength(4);
  });

  it("uses a calm spring for micro-interactions", () => {
    expect(SPRING_SOFT).toMatchObject({ type: "spring", stiffness: 320, damping: 30 });
  });

  it("stagger step is a small positive number of seconds", () => {
    expect(STAGGER_STEP).toBeGreaterThan(0);
    expect(STAGGER_STEP).toBeLessThan(0.1);
  });
});

describe("motion variants", () => {
  it("fadeSlideUp enters from a small upward offset to rest", () => {
    expect(fadeSlideUp.initial).toMatchObject({ opacity: 0, y: 8 });
    expect(fadeSlideUp.animate).toMatchObject({ opacity: 1, y: 0 });
    expect(fadeSlideUp.exit).toMatchObject({ opacity: 0 });
  });

  it("staggerItem reuses the standard entrance", () => {
    expect(staggerItem).toBe(fadeSlideUp);
  });

  it("staggerContainer staggers children on enter and reverses on exit", () => {
    const animate = staggerContainer.animate as { transition: { staggerChildren: number } };
    const exit = staggerContainer.exit as { transition: { staggerDirection: number } };
    expect(animate.transition.staggerChildren).toBe(STAGGER_STEP);
    expect(exit.transition.staggerDirection).toBe(-1);
  });

  it("popoverPresence zooms in from the anchor and fades out", () => {
    expect(popoverPresence.initial).toMatchObject({ opacity: 0, scale: 0.96 });
    expect(popoverPresence.animate).toMatchObject({ opacity: 1, scale: 1 });
    expect(popoverPresence.exit).toMatchObject({ opacity: 0, scale: 0.96 });
  });
});

/// <reference types="vitest/globals" />

/**
 * Placement for the year views' pins.
 *
 * The boxes are the bubbles' measured sizes, so these cases are about the rules,
 * not the maths: a pin keeps the axis it was told not to move on, stays inside
 * its container, and would rather overlap its neighbour than wander to a
 * different day.
 */

import { PIN_EDGE_MARGIN, placePins, type PinBox } from "@/lib/highlights/pin-layout";

const container = { width: 600, height: 800 };

const pin = (over: Partial<PinBox> & { id: string }): PinBox => ({
  x: 0,
  y: 0,
  w: 60,
  h: 14,
  ...over,
});

describe("placePins", () => {
  it("leaves pins that already clear each other alone", () => {
    const placed = placePins([pin({ id: "a", y: 20 }), pin({ id: "b", y: 40 })], { container });
    expect(placed).toEqual([
      { id: "a", x: PIN_EDGE_MARGIN, y: 20, w: 60, h: 14 },
      { id: "b", x: PIN_EDGE_MARGIN, y: 40, w: 60, h: 14 },
    ]);
  });

  it("carries each box's own fields through, so a caller needs no lookup", () => {
    const placed = placePins(
      [
        { ...pin({ id: "a", y: 0 }), label: "Left the job" },
        { ...pin({ id: "b", y: 1 }), label: "Moved house" },
      ],
      { container },
    );
    expect(placed.find((entry) => entry.id === "b")).toMatchObject({ label: "Moved house" });
  });

  it("moves a colliding pin one box clear, in the default direction", () => {
    const placed = placePins([pin({ id: "a", y: 100 }), pin({ id: "b", y: 102 })], { container });
    // a covers 100..114, and the pitch is its own height plus the gap: 102 → 120.
    expect(placed.find((p) => p.id === "b")?.y).toBe(120);
    expect(placed.find((p) => p.id === "a")).toMatchObject({ y: 100 });
  });

  it("nudges upward when told to, for pins hung above their date", () => {
    const placed = placePins([pin({ id: "a", y: 200 }), pin({ id: "b", y: 202 })], { container, direction: -1 });
    const b = placed.find((p) => p.id === "b");
    // The first nudge is -18 (its height + 4), which clears a.
    expect(b?.y).toBe(184);
  });

  it("never moves a pin on the axis it was not given", () => {
    const placed = placePins([pin({ id: "a", x: 20, y: 0 }), pin({ id: "b", x: 20, y: 0 })], { container });
    expect(placed.every((p) => p.x === 20)).toBe(true);
  });

  it("moves along the row instead when told to", () => {
    const placed = placePins([pin({ id: "a", y: 0 }), pin({ id: "b", y: 0 })], { container, axis: "x" });
    const b = placed.find((p) => p.id === "b");
    // A bubble has to clear the one beside it, so the nudge is its own width.
    expect(b?.x).toBe(PIN_EDGE_MARGIN + 64);
    // A horizontal placement leaves y exactly where the grid put it: rows can sit
    // outside the visible window, so they are not pulled into it.
    expect(placed.every((p) => p.y === 0)).toBe(true);
  });

  it("spreads an X stack both ways rather than drifting off one edge", () => {
    const placed = placePins(
      [pin({ id: "a", x: 200, y: 0 }), pin({ id: "b", x: 200, y: 0 }), pin({ id: "c", x: 200, y: 0 })],
      { container, axis: "x", step: 60 },
    );
    expect(placed.map((p) => p.x).sort((left, right) => left - right)).toEqual([140, 200, 260]);
  });

  it("keeps every bubble inside the container, however late the date", () => {
    // A bubble anchored on the last column would hang off a phone's screen.
    const placed = placePins([pin({ id: "a", x: 560, y: 2, w: 130, h: 44 })], { container });
    expect(placed[0].x).toBe(600 - 130 - PIN_EDGE_MARGIN);
  });

  it("stays inside the container when reverting to its anchor", () => {
    // The anchor itself is off the edge: it is pulled in before anything else.
    const placed = placePins([pin({ id: "a", x: 900, y: 0, w: 130, h: 44 })], { container });
    expect(placed[0].x).toBe(600 - 130 - PIN_EDGE_MARGIN);
  });

  it("would rather overlap its neighbour than leave its own date", () => {
    // 20 pins of 4px on one spot: none of them can clear within three steps, so
    // they all stay on their anchor instead of marching down the page.
    const many = Array.from({ length: 20 }, (_, i) => pin({ id: `p${i}`, y: 100, h: 4 }));
    const placed = placePins(many, { container, maxSteps: 3 });
    expect(placed).toHaveLength(20);
    // Within the three nudges it was allowed (8px each), not marching off.
    expect(Math.max(...placed.map((p) => p.y))).toBeLessThanOrEqual(124);
  });

  it("takes pins in vertical order, so a later target can't displace an earlier one", () => {
    const placed = placePins(
      [pin({ id: "late", y: 60 }), pin({ id: "early", y: 0 }), pin({ id: "clash", y: 63 })],
      { container },
    );
    expect(placed.find((p) => p.id === "early")?.y).toBe(PIN_EDGE_MARGIN);
    expect(placed.find((p) => p.id === "clash")?.y).not.toBe(63);
  });
});

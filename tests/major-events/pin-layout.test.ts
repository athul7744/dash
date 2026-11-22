/// <reference types="vitest/globals" />

import { placePins, type PinBox } from "@/lib/major-events/pin-layout";

const pin = (over: Partial<PinBox> & { id: string }): PinBox => ({
  x: 0,
  y: 0,
  w: 60,
  h: 14,
  ...over,
});

describe("placePins", () => {
  it("leaves pins that already clear each other alone", () => {
    const placed = placePins([pin({ id: "a", y: 0 }), pin({ id: "b", y: 40 })]);
    expect(placed).toEqual([
      { id: "a", x: 0, y: 0, w: 60, h: 14 },
      { id: "b", x: 0, y: 40, w: 60, h: 14 },
    ]);
  });

  it("carries each box's own fields through, so a caller needs no lookup", () => {
    const placed = placePins([
      { ...pin({ id: "a", y: 0 }), label: "Left the job" },
      { ...pin({ id: "b", y: 1 }), label: "Moved house" },
    ]);
    const b = placed.find((entry) => entry.id === "b");
    expect(b).toMatchObject({ label: "Moved house" });
  });

  it("pushes a colliding pin one box clear by default", () => {
    const placed = placePins([pin({ id: "a", y: 0 }), pin({ id: "b", y: 2 })]);
    // a covers 0..14, so b lands just past it in one nudge of its own height.
    expect(placed.find((p) => p.id === "b")?.y).toBe(20);
    expect(placed.find((p) => p.id === "a")).toMatchObject({ y: 0 });
  });

  it("never moves a pin on the axis it was not given, so it stays in its day's column", () => {
    const placed = placePins([pin({ id: "a", x: 20, y: 0 }), pin({ id: "b", x: 20, y: 0 })]);
    expect(placed.every((p) => p.x === 20)).toBe(true);
  });

  it("moves along the row instead when told to", () => {
    const placed = placePins([pin({ id: "a", y: 0 }), pin({ id: "b", y: 0 })], { axis: "x" });
    const b = placed.find((p) => p.id === "b");
    // A bubble has to clear the one beside it, so the nudge is its own width.
    expect(b?.x).toBe(64);
    expect(placed.every((p) => p.y === 0)).toBe(true);
  });

  it("spreads an X stack both ways rather than drifting off one edge", () => {
    const placed = placePins(
      [pin({ id: "a", y: 0 }), pin({ id: "b", y: 0 }), pin({ id: "c", y: 0 })],
      { axis: "x", step: 60 },
    );
    expect(placed.map((p) => p.x).sort((left, right) => left - right)).toEqual([-60, 0, 60]);
  });

  it("leaves a pin that cannot clear where it was, instead of pushing it away", () => {
    const many = Array.from({ length: 20 }, (_, i) => pin({ id: `p${i}`, y: 0, h: 4 }));
    const placed = placePins(many, { step: 1, maxSteps: 3 });
    expect(placed).toHaveLength(20);
    // Every pin is within three nudges of its own target, and the ones that could
    // not clear sit on top of an earlier pin rather than further down the page.
    expect(Math.max(...placed.map((p) => p.y))).toBeLessThanOrEqual(3);
  });

  it("takes pins in vertical order, so a later target can't displace an earlier one", () => {
    const placed = placePins([pin({ id: "late", y: 60 }), pin({ id: "early", y: 0 }), pin({ id: "clash", y: 63 })]);
    expect(placed.find((p) => p.id === "early")?.y).toBe(0);
    expect(placed.find((p) => p.id === "late")?.y).toBe(60);
    // It may not clear at all — then it stays on its own target rather than
    // wandering to a different one.
    expect(Math.abs(placed.find((p) => p.id === "clash")!.y - 63)).toBeLessThanOrEqual(12 * 4);
  });
});

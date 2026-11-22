/// <reference types="vitest/globals" />

/**
 * The year views' pins: a bubble per marked day, and one leader from the day back
 * to the bubble.
 *
 * A busy month lays its pins out in two lanes, alternating in date order, so the
 * sequence still reads like a calendar instead of stacking upward out of the card.
 *
 * The two grids draw their point differently. The mood grid hangs a bubble above
 * its date and joins the two with a leader. The activity grid sits the bubble
 * beside the row it marks, so the point lives on the bubble's own left edge and no
 * line is drawn across the grid.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { YearHighlightPins, type YearPin } from "@/components/tracker/YearHighlightPins";

const BUBBLE = { width: 120, height: 30 };
const LAYER = { width: 500, height: 400 };

const rect = (w: number, h: number) => ({
  width: w,
  height: h,
  left: 0,
  top: 0,
  right: w,
  bottom: h,
  x: 0,
  y: 0,
  toJSON: () => ({}),
});

let original: typeof Element.prototype.getBoundingClientRect;
let container: HTMLDivElement;
let root: Root;

const pin = (over: Partial<YearPin> = {}): YearPin => ({
  id: over.id ?? "2026-03-14",
  anchorX: over.anchorX ?? 200,
  anchorY: over.anchorY ?? 300,
  label: over.label ?? "Aswins brother",
  emoji: null,
  tagColors: over.tagColors ?? ["rose"],
  eventIds: over.eventIds ?? ["e1"],
});

const render = (pins: YearPin[], axis: "x" | "y") => {
  act(() => {
    root.render(<YearHighlightPins pins={pins} axis={axis} />);
  });
};

/** The point a horizontal pin wears on its body. */
const bodyPoint = () => container.querySelector("button span.rotate-45, div > span.rotate-45");

/** The leader lines the component draws — `line` elements, not icon geometry. */
const leaders = () =>
  [...container.querySelectorAll("svg > g > line")].map((line) => ({
    x1: Number(line.getAttribute("x1")),
    y1: Number(line.getAttribute("y1")),
    x2: Number(line.getAttribute("x2")),
    y2: Number(line.getAttribute("y2")),
  }));

const diamonds = () => container.querySelectorAll("svg > g > path").length;

beforeEach(() => {
  original = Element.prototype.getBoundingClientRect;
  // The layer is its container; a bubble measures the same wherever it lands.
  Element.prototype.getBoundingClientRect = function (this: Element) {
    return this.hasAttribute("data-pin-id") ? rect(BUBBLE.width, BUBBLE.height) : rect(LAYER.width, LAYER.height);
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Element.prototype.getBoundingClientRect = original;
});

describe("YearHighlightPins", () => {
  it("hangs a vertically placed pin above its date and points up at it", () => {
    render([pin({ anchorX: 200, anchorY: 300 })], "y");

    // Centred on the date, its bottom just above it.
    const bubble = container.querySelector("[data-pin-id]") as HTMLElement;
    expect(bubble.style.left).toBe("140px");
    expect(bubble.style.top).toBe("264px");

    // The leader runs from the date up to the bubble's bottom edge, and the
    // diamond marks the date.
    expect(leaders()).toEqual([{ x1: 200, y1: 300, x2: 200, y2: 294 }]);
    expect(diamonds()).toBe(1);
  });

  it("places a horizontally placed pin beside its row, with its point on its body", () => {
    render([pin({ anchorX: 100, anchorY: 300 })], "x");

    const bubble = container.querySelector("[data-pin-id]") as HTMLElement;
    expect(bubble.style.left).toBe("110px");
    // Level with the row: centred on its centreline.
    expect(bubble.style.top).toBe("285px");

    // No line across the grid; the diamond sits on the bubble's left edge.
    expect(leaders()).toHaveLength(0);
    const point = bodyPoint() as HTMLElement;
    expect(point).not.toBeNull();
    expect(point.style.left).toBe("-4px");
  });

  it("gives every pin its own leader, however they are nudged", () => {
    render(
      [
        pin({ id: "a", anchorX: 100, anchorY: 300 }),
        pin({ id: "b", anchorX: 100, anchorY: 305 }),
        pin({ id: "c", anchorX: 100, anchorY: 312 }),
      ],
      "x",
    );

    expect(container.querySelectorAll("[data-pin-id]")).toHaveLength(3);
    // Every pin keeps its own point, and none of them draws a line.
    expect(container.querySelectorAll("span.rotate-45")).toHaveLength(3);
    expect(leaders()).toHaveLength(0);
    // Nudged pins fan out along the row rather than stacking.
    const lefts = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")].map((el) => el.style.left);
    expect(new Set(lefts).size).toBeGreaterThan(1);
  });

  it("stays decorative when nothing can be opened", () => {
    render([pin()], "y");
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the extra count when a day has more than one highlight", () => {
    render([{ ...pin(), eventIds: ["e1", "e2"], extra: 1 }], "y");
    expect(container.textContent).toContain("+1");
  });
});

describe("a busy month", () => {
  const band = { left: 20, width: 240 };
  const at = (day: number) => ({
    ...pin({ id: `2026-10-${String(day).padStart(2, "0")}` }),
    anchorY: 300 + day * 4,
    anchorX: 100,
    group: "2026-10",
    laneArea: band,
  });

  it("splits into two lanes past three pins, alternating in date order", () => {
    const days = [2, 3, 4, 9];
    render(days.map(at), "y");

    const boxes = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")].map((el) => ({
      id: el.dataset.pinId,
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      // The bubble inside carries the lane width; the wrapper only positions it.
      width: parseFloat((el.firstElementChild as HTMLElement).style.width || "NaN"),
    }));
    const byId = Object.fromEntries(boxes.map((box) => [box.id, box]));

    // 02 → lane 0, 03 → lane 1, 04 → lane 0 again, one row lower.
    expect(byId["2026-10-02"].left).toBe(band.left);
    expect(byId["2026-10-03"].left).toBeGreaterThan(byId["2026-10-02"].left);
    expect(byId["2026-10-04"].left).toBe(band.left);
    expect(byId["2026-10-04"].top).toBeGreaterThan(byId["2026-10-02"].top);

    // Both lanes are half the band, so the bubble fits the space it was given.
    expect(byId["2026-10-02"].width).toBeLessThan(band.width / 2 + 1);

    // Reading left to right, top to bottom is date order.
    const readingOrder = [...boxes].sort((a, b) => a.top - b.top || a.left - b.left).map((box) => box.id);
    expect(readingOrder).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-09"]);
  });

  it("keeps one column while a month is sparse, so labels stay whole", () => {
    render([2, 3, 4].map(at), "y");

    const widths = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")].map(
      (el) => (el.firstElementChild as HTMLElement).style.width,
    );
    // Three pins fit a single column: no width is imposed, so the bubble keeps its
    // natural size and the label is not squeezed into a lane.
    expect(widths).toEqual(["", "", ""]);
  });

  it("never draws a later date above an earlier one in the same lane", () => {
    const days = [2, 3, 4, 9, 17, 24, 31];
    render(days.map(at), "y");

    const boxes = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")].map((el) => ({
      id: el.dataset.pinId ?? "",
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      height: el.getBoundingClientRect().height || 30,
    }));
    const lanes = new Map<number, typeof boxes>();
    for (const box of boxes) {
      const lane = Math.round((box.left - band.left) / (band.width / 2));
      lanes.set(lane, [...(lanes.get(lane) ?? []), box]);
    }

    for (const lane of lanes.values()) {
      const sorted = [...lane].sort((a, b) => a.id.localeCompare(b.id));
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].top).toBeGreaterThanOrEqual(sorted[i - 1].top + sorted[i - 1].height);
      }
    }
  });
});

describe("a card's edges", () => {
  const at = (day: number, band: { left: number; width: number; top?: number }) => ({
    ...pin({ id: `2026-10-${String(day).padStart(2, "0")}` }),
    anchorY: 300 + day * 4,
    anchorX: 100,
    group: "2026-10",
    laneArea: band,
  });

  it("starts below the month header, not over the month's name", () => {
    // The first week's pin naturally hangs above its date, which is where the
    // header is; the band's `top` is the line it may not cross.
    const band = { left: 20, width: 240, top: 290 };
    render([2, 3, 4, 9].map((day) => at(day, band)), "y");

    const tops = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")].map((el) => parseFloat(el.style.top));
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(band.top);
  });

  it("uses the card's full width for its lanes", () => {
    const band = { left: 20, width: 240, top: 0 };
    render([2, 3, 4, 9].map((day) => at(day, band)), "y");

    const [first, second] = [...container.querySelectorAll<HTMLElement>("[data-pin-id]")];
    expect(parseFloat(first.style.left)).toBe(band.left);
    // Two lanes and one gap fill the band exactly.
    expect(parseFloat(second.style.left) + parseFloat((second.firstElementChild as HTMLElement).style.width)).toBe(band.left + band.width);
  });
});

describe("reporting what a card has to grow by", () => {
  it("hands back the overhang past the day block, per group", () => {
    const spacers: Record<string, number>[] = [];
    const band = { left: 20, width: 240, top: 290, bottom: 320 };

    act(() => {
      root.render(
        <YearHighlightPins
          pins={[2, 3, 4, 9].map((day) => ({
            ...pin({ id: `2026-10-${String(day).padStart(2, "0")}` }),
            anchorY: 300 + day * 4,
            anchorX: 100,
            group: "2026-10",
            laneArea: band,
          }))}
          axis="y"
          onLayout={(next) => spacers.push(next)}
        />,
      );
    });

    const reported = spacers.at(-1) ?? {};
    // Four 30px bubbles in two lanes reach 34px past the day block (320 → 354),
    // which is what the month card reserves below its days.
    expect(reported["2026-10"]).toBe(34);

    // A card with room to spare reports nothing, so it keeps its height.
    spacers.length = 0;
    act(() => {
      root.render(
        <YearHighlightPins
          pins={[{ ...pin({ id: "2026-11-04" }), anchorY: 300, anchorX: 100, group: "2026-11", laneArea: { ...band, bottom: 2000 } }]}
          axis="y"
          onLayout={(next) => spacers.push(next)}
        />,
      );
    });
    expect(spacers.at(-1)).toEqual({});
  });
});

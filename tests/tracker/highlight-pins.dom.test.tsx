/// <reference types="vitest/globals" />

/**
 * The year views' pins: a bubble per marked day, and one leader from the day back
 * to the bubble.
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

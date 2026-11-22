/// <reference types="vitest/globals" />

/**
 * The mark that stands in for a highlight's tags wherever one colour has to do
 * the work of two — a pin, the year rail, a week's day column.
 *
 * Two rules matter here: a pair of tags must show *both* colours (a single fill
 * would make the second tag invisible), and the shape is a squircle at every size,
 * because a circle reads as a mood dot and a square as a cell.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { TagColorMark } from "@/components/tags/TagColorMark";

let container: HTMLDivElement;
let root: Root;

const render = (element: React.ReactElement) => {
  act(() => {
    root.render(element);
  });
  return container.firstElementChild as HTMLElement | null;
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TagColorMark", () => {
  it("fills solid for a single tag", () => {
    const mark = render(<TagColorMark colors={["rose"]} />)!;
    expect(mark.style.backgroundColor).toBe("rgb(251, 113, 133)");
    expect(mark.style.backgroundImage).toBe("");
  });

  it("splits corner to corner for two tags, so both colours are visible", () => {
    const mark = render(<TagColorMark colors={["rose", "lime"]} />)!;
    const gradient = mark.style.backgroundImage;

    expect(gradient).toContain("linear-gradient(135deg");
    expect(gradient).toContain("#fb7185");
    expect(gradient).toContain("#a3e635");
    // Halves, not a blend: a gradient with stops at 50% keeps each colour pure.
    expect(gradient).toContain("50%");
    expect(mark.style.backgroundColor).toBe("");
  });

  it("keeps the squircle radius proportional to its size", () => {
    const small = render(<TagColorMark colors={["rose"]} size={9} />)!;
    expect(small.style.borderRadius).toBe("3px");

    const large = render(<TagColorMark colors={["rose"]} size={14} />)!;
    expect(large.style.borderRadius).toBe("4px");
  });

  it("renders nothing when there is no colour to show", () => {
    expect(render(<TagColorMark colors={[]} />)).toBeNull();
  });

  it("is decorative — the row it sits in carries the meaning", () => {
    const mark = render(<TagColorMark colors={["rose"]} />)!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
  });
});

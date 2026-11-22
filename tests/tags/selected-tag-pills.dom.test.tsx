/// <reference types="vitest/globals" />

/**
 * `SelectedTagPills` is the read-only half of a tag control: it resolves ids to
 * pills and renders them in their own colours.
 *
 * The `max` cap exists for a compact row (a highlight's line on the Day
 * surface), where showing all of them would wrap the row: it must still say how
 * many it is hiding, or a tag would vanish silently.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use-tags", () => ({
  useAllTags: () => ({
    tags: [
      { id: "t1", name: "AI", color: "rose" },
      { id: "t2", name: "Health", color: "lime" },
      { id: "t3", name: "Books", color: "sky" },
    ],
    isLoading: false,
  }),
}));

import { SelectedTagPills } from "@/components/tags/SelectedTagPills";

let container: HTMLDivElement;
let root: Root;

const render = (element: React.ReactElement) => {
  act(() => {
    root.render(element);
  });
  return container;
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

describe("SelectedTagPills", () => {
  it("renders each tag in its own colour, in id order", () => {
    render(<SelectedTagPills tagIds={["t1", "t3"]} />);
    const pills = [...container.querySelectorAll("span")];

    expect(pills.map((p) => p.textContent)).toEqual(["AI", "Books"]);
    expect(pills[0].className).toContain("bg-rose-100");
    expect(pills[1].className).toContain("bg-sky-100");
  });

  it("caps at `max` and counts the rest instead of dropping them silently", () => {
    render(<SelectedTagPills tagIds={["t1", "t2", "t3"]} max={2} />);
    const pills = [...container.querySelectorAll("span")].map((p) => p.textContent);

    expect(pills).toEqual(["AI", "Health", "+1"]);
  });

  it("shows no counter when nothing is hidden", () => {
    render(<SelectedTagPills tagIds={["t1", "t2"]} max={2} />);
    const pills = [...container.querySelectorAll("span")].map((p) => p.textContent);

    expect(pills).toEqual(["AI", "Health"]);
  });

  it("renders nothing for no tags, or for ids whose tag is gone", () => {
    expect(render(<SelectedTagPills tagIds={[]} />).textContent).toBe("");
    expect(render(<SelectedTagPills tagIds={["missing"]} />).textContent).toBe("");
  });
});

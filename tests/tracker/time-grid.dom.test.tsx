/// <reference types="vitest/globals" />

/**
 * The week grid's Day column.
 *
 * Each day name is the way into that day's own page, so the href has to be the
 * *local* calendar key — the grid's rows are local days, and a UTC-derived key
 * would send anyone west of UTC to the day before.
 *
 * Rendered without `ratings`, which drops the mood column and its Select; this
 * is about the Day column.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { TimeGrid } from "@/components/tracker/TimeGrid";

let container: HTMLDivElement;
let root: Root;

const render = (days: Date[]) => {
  act(() => {
    root.render(
      <TimeGrid days={days} data={new Map()} colorMap={{}} onCellClick={() => {}} moods={[]} />,
    );
  });
};

/** Day-column links only — the hour cells are plain `<td>`s. */
const dayLinks = () => [...container.querySelectorAll("a[href^='/day/']")];

// The grid scrolls the current hour into view on mount; jsdom has no scrollTo.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("TimeGrid's Day column", () => {
  it("links each row to that day", () => {
    render([new Date(2026, 8, 20), new Date(2026, 8, 21)]);
    expect(dayLinks().map((a) => a.getAttribute("href"))).toEqual(["/day/2026-09-20", "/day/2026-09-21"]);
  });

  it("uses the local calendar day, not a UTC one", () => {
    // Late on the 20th local time is already the 21st in UTC. Deriving the key
    // from the instant would open the wrong day for most of the world.
    render([new Date(2026, 8, 20, 23, 30)]);
    expect(dayLinks()[0].getAttribute("href")).toBe("/day/2026-09-20");
  });

  it("names the day it opens", () => {
    render([new Date(2026, 8, 20)]);
    expect(dayLinks()[0].getAttribute("title")).toBe("Open 20 September 2026");
    expect(dayLinks()[0].textContent).toBe("Sun, Sep 20");
  });

  it("gives one link per day and no more", () => {
    render([new Date(2026, 8, 20), new Date(2026, 8, 21), new Date(2026, 8, 22)]);
    expect(dayLinks()).toHaveLength(3);
  });
});

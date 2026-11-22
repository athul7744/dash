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
 *
 * A day that is a highlight carries its squircle beside the name — the wiring
 * below checks it renders next to the name (and not, say, in an hour cell); the
 * centring is CSS and is checked by eye.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The grid reads the week's highlights (a mark beside each day's name), which
// reaches the PowerSync client through the highlights lib — jsdom has no Worker.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

// The week's events: one day has two (tag colours rose + lime), the rest none.
vi.mock("@/hooks/use-highlights", () => ({
  useHighlightsForDays: (dayKeys: string[]) => {
    const byDay = new Map();
    if (dayKeys.includes("2026-09-20")) {
      byDay.set("2026-09-20", [{ id: "e1", at: "2026-09-20", title: "Left the job", note: "", emoji: null, tagIds: ["t1", "t2"], sortRank: "a" }]);
    }
    return byDay;
  },
}));

vi.mock("@/hooks/use-tags", () => ({
  useAllTags: () => ({
    tags: [
      { id: "t1", name: "AI", color: "rose" },
      { id: "t2", name: "Health", color: "lime" },
    ],
    isLoading: false,
  }),
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

  it("marks a day that is a major event beside its name, in its tag colours", () => {
    render([new Date(2026, 8, 20), new Date(2026, 8, 21)]);

    const [marked, plain] = dayLinks();
    const mark = marked.querySelector("span[aria-hidden]") as HTMLElement | null;

    expect(mark).not.toBeNull();
    // Beside the name, not pushed to the far edge of the column.
    expect(marked.firstElementChild?.textContent).toBe("Sun, Sep 20");
    expect(marked.children[1]).toBe(mark);
    // Two tags, so the mark is split between their hexes rather than one fill.
    expect(mark!.style.backgroundImage).toContain("linear-gradient");
    expect(mark!.style.backgroundImage).toContain("#fb7185");
    expect(mark!.style.backgroundImage).toContain("#a3e635");

    // A day with no event says nothing about events.
    expect(plain.querySelector("span[aria-hidden]")).toBeNull();
  });

  it("gives one link per day and no more", () => {
    render([new Date(2026, 8, 20), new Date(2026, 8, 21), new Date(2026, 8, 22)]);
    expect(dayLinks()).toHaveLength(3);
  });
});

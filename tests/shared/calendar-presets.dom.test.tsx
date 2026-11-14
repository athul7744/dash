/// <reference types="vitest/globals" />

/**
 * The quick-pick row baked into the shared `Calendar`.
 *
 * Eight call sites (task due dates, note properties, query cells and filters,
 * events, the day surface, the `/` date command) get this row without asking for
 * it, so the behaviour it must not get wrong is: appear only where a date is
 * ambiguous (single mode), hand back the date the label promises, offer Clear
 * only when a caller said clearing is meaningful, and honour a caller's own list.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Calendar } from "@/components/ui/calendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

function renderCalendar(props: React.ComponentProps<typeof Calendar>) {
  act(() => {
    root = createRoot(container);
    root.render(React.createElement(Calendar, props));
  });
}

function presetLabels() {
  const row = container.querySelector('[data-slot="calendar-presets"]');
  return row ? [...row.querySelectorAll("button")].map((button) => button.textContent?.trim()) : [];
}

function clickPreset(label: string) {
  const row = container.querySelector('[data-slot="calendar-presets"]');
  const button = [...(row?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === label);
  if (!button) throw new Error(`no "${label}" preset rendered`);
  act(() => {
    button.click();
  });
}

/** Local midnight, which is what the presets hand back. */
function localDay(offsetDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("Calendar date presets", () => {
  it("offers today, tomorrow, and next week on a single-date calendar", () => {
    renderCalendar({ mode: "single", onSelect: vi.fn() });
    expect(presetLabels()).toEqual(["Today", "Tomorrow", "Next week"]);
  });

  it("hands back the day the label promises", () => {
    const onSelect = vi.fn();
    renderCalendar({ mode: "single", onSelect });

    clickPreset("Today");
    clickPreset("Tomorrow");
    clickPreset("Next week");

    expect(onSelect.mock.calls.map(([date]) => (date as Date).toISOString().slice(0, 10))).toEqual([
      localDay(0),
      localDay(1),
      localDay(7),
    ]);
  });

  it("is off when the caller turns it off or supplies its own list", () => {
    renderCalendar({ mode: "single", onSelect: vi.fn(), presets: false });
    expect(presetLabels()).toEqual([]);

    act(() => root?.unmount());
    root = null;
    renderCalendar({ mode: "single", onSelect: vi.fn(), presets: [{ label: "Yesterday", date: () => new Date() }] });
    expect(presetLabels()).toEqual(["Yesterday"]);
  });

  it("offers Clear only when the caller can express no date, and only with one set", () => {
    const onSelect = vi.fn();
    renderCalendar({ mode: "single", selected: new Date(), onSelect });
    expect(presetLabels()).not.toContain(null);
    expect(container.querySelector('button[aria-label="Clear date"]')).toBeNull();

    act(() => root?.unmount());
    root = null;
    renderCalendar({ mode: "single", selected: new Date(), onSelect, clearable: true });
    const clear = container.querySelector('button[aria-label="Clear date"]');
    expect(clear).not.toBeNull();

    act(() => {
      (clear as HTMLButtonElement).click();
    });
    expect(onSelect).toHaveBeenCalledWith(undefined);
  });

  it("hides Clear while nothing is selected", () => {
    renderCalendar({ mode: "single", onSelect: vi.fn(), clearable: true });
    expect(container.querySelector('button[aria-label="Clear date"]')).toBeNull();
  });
});

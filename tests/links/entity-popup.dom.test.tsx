/// <reference types="vitest/globals" />

/**
 * When the shared entity popup closes itself.
 *
 * It renders each app's real card, so the card's own actions can take the thing
 * out from under it: deleting trashes the row, and following a link inside the
 * card navigates away. Neither goes through the popup, so both have to be
 * noticed rather than handled — and getting the noticing wrong is silent, since
 * a popup that fails to close just sits there over a deleted item.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { rows, pathname } = vi.hoisted(() => ({
  rows: { value: [] as unknown[] },
  pathname: { value: "/notes" },
}));

// One stand-in for every lookup the popup makes: the entity resolves while
// `rows` has something in it, and stops when it doesn't — which is what
// soft-deleting the row does to those queries.
vi.mock("@powersync/react", () => ({
  useQuery: (sql: string) => ({
    data: sql.includes("WHERE 1 = 0") || sql.includes("WHERE 0") ? [] : rows.value,
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/hooks/use-entity-tags", () => ({ useEntityTags: () => new Map() }));
// The card modules reach the real PowerSync database, which opens a Worker that
// jsdom has no answer for — it surfaces as an unhandled rejection rather than a
// failure, so mock the module instead of letting it construct.
vi.mock("@/lib/powersync/db", () => ({
  db: { execute: vi.fn(), getAll: vi.fn(async () => []), writeTransaction: vi.fn() },
}));

// The cards are the app's own surfaces; this is about the shell around them.
vi.mock("@/components/tasks/TaskCard", () => ({ TaskCard: () => <div data-testid="card">task</div> }));
vi.mock("@/components/bookmarks/BookmarkCard", () => ({ BookmarkCard: () => <div data-testid="card">bookmark</div> }));
vi.mock("@/components/quotes/QuoteCard", () => ({ QuoteCard: () => <div data-testid="card">quote</div> }));
vi.mock("@/components/events/EventCard", () => ({ EventCard: () => <div data-testid="card">event</div> }));

import { EntityPopup, type EntityRef } from "@/components/command/EntityPopup";

let container: HTMLDivElement;
let root: Root;
let closed: number;

/** Mirrors the provider: the popup's `item` is cleared when it asks to close. */
function render(item: EntityRef | null) {
  act(() => {
    root.render(
      <EntityPopup
        item={item}
        onOpenChange={(open) => {
          if (!open) closed += 1;
        }}
      />,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  closed = 0;
  rows.value = [{ id: "task-1", content: "{}", sort_rank: "a" }];
  pathname.value = "/notes";
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("EntityPopup", () => {
  it("closes when its entity is deleted out from under it", () => {
    render({ kind: "task", id: "task-1" });
    expect(closed).toBe(0);

    rows.value = []; // the delete: the row is trashed, so it no longer resolves
    render({ kind: "task", id: "task-1" });

    expect(closed).toBeGreaterThan(0);
  });

  it("does not close while the entity is still loading", () => {
    // The first frame of a fresh lookup has no row yet; closing there would make
    // the popup impossible to open at all.
    rows.value = [];
    render({ kind: "task", id: "task-1" });
    expect(closed).toBe(0);
  });

  it("does not close when one item is swapped for another", () => {
    render({ kind: "task", id: "task-1" });
    rows.value = []; // the new item's lookup hasn't settled yet
    render({ kind: "bookmark", id: "bookmark-9" });
    expect(closed).toBe(0);
  });

  it("closes when the route changes under it", () => {
    render({ kind: "task", id: "task-1" });
    expect(closed).toBe(0);

    pathname.value = "/events/abc"; // followed a link inside the card
    render({ kind: "task", id: "task-1" });

    expect(closed).toBeGreaterThan(0);
  });

  it("stays open when nothing moved", () => {
    render({ kind: "task", id: "task-1" });
    render({ kind: "task", id: "task-1" });
    expect(closed).toBe(0);
  });
});

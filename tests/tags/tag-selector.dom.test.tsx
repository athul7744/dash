/// <reference types="vitest/globals" />

/**
 * `TagSelector`'s trigger.
 *
 * Its `triggerProps` are documented as props for "the trigger itself" — the
 * surface that borrows the control passes its accessible name there. They were
 * only spread on the `triggerContent` branch, so a caller using the default
 * "+ Tag" trigger silently lost its label.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The selector can create a tag, which reaches the PowerSync client — jsdom has
// no Worker, so the db module is stubbed.
vi.mock("@/lib/powersync/db", () => ({ db: { execute: vi.fn(), writeTransaction: vi.fn() } }));

vi.mock("@/hooks/use-tags", () => ({
  useAllTags: () => ({ tags: [{ id: "t1", name: "AI", color: "rose" }], isLoading: false }),
}));

import { TagSelector } from "@/components/tags/TagSelector";

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

describe("TagSelector trigger", () => {
  it("carries the caller's aria-label on the default trigger", () => {
    const el = render(
      <TagSelector
        selectedTagIds={[]}
        onSelectedTagIdsChange={() => {}}
        triggerLabel="Add"
        triggerProps={{ "aria-label": "Add a tag to this event" }}
      />,
    );

    const trigger = el.querySelector("[aria-label='Add a tag to this event']");
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toContain("Add");
  });

  it("keeps the label on a custom triggerContent too", () => {
    const el = render(
      <TagSelector
        selectedTagIds={[]}
        onSelectedTagIdsChange={() => {}}
        triggerContent={<span>Tags</span>}
        triggerProps={{ "aria-label": "Edit tags" }}
      />,
    );

    expect(el.querySelector("[aria-label='Edit tags']")).not.toBeNull();
  });
});

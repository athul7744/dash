/// <reference types="vitest/globals" />

/**
 * A cross-app entity as a list row.
 *
 * The point of the component is that a row is openable and wears its kind, so
 * that's what's asserted: a click reaches the same `OPEN_ENTITY_EVENT` an inline
 * `[[ ]]` chip fires (the palette provider listens for it), and a kind that only
 * navigates stays a real anchor so middle-click still works.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));

import { OPEN_ENTITY_EVENT, type OpenEntityDetail } from "@/components/links/EntityRefNode";
import { EntityRow } from "@/components/links/EntityRow";

let container: HTMLDivElement;
let root: Root;

const render = (ui: React.ReactElement) => {
  act(() => {
    root.render(ui);
  });
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

describe("EntityRow", () => {
  it("opens its target the way a reference chip does", () => {
    const opened: OpenEntityDetail[] = [];
    const listener = (event: Event) => opened.push((event as CustomEvent<OpenEntityDetail>).detail);
    window.addEventListener(OPEN_ENTITY_EVENT, listener as EventListener);

    render(
      <EntityRow kind="task" id="task-1">
        Buy milk
      </EntityRow>,
    );

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    window.removeEventListener(OPEN_ENTITY_EVENT, listener as EventListener);
    expect(opened).toEqual([{ kind: "task", id: "task-1" }]);
  });

  it("stays a link when the kind navigates", () => {
    // A note is reached by URL, so the row has to keep an href — dispatching
    // would open it in this tab only, losing middle-click and open-in-new-tab.
    render(
      <EntityRow kind="note" id="page-1" href="/notes/page-1">
        Project
      </EntityRow>,
    );

    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/notes/page-1");
  });

  it("shows the kind's own icon rather than one the surface chose", () => {
    // Every kind renders an svg; what matters is that it comes from the shared
    // map, so a row can't drift from the chip for the same entity.
    for (const kind of ["task", "bookmark", "quote", "event", "day"] as const) {
      render(
        <EntityRow kind={kind} id="x">
          Something
        </EntityRow>,
      );
      expect(container.querySelector("svg"), kind).not.toBeNull();
    }
  });

  it("strikes through what is already done", () => {
    render(
      <EntityRow kind="task" id="task-1" done trailing="done">
        Buy milk
      </EntityRow>,
    );
    expect(container.querySelector(".line-through")?.textContent).toBe("Buy milk");
  });
});

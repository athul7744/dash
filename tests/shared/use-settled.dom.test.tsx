/// <reference types="vitest/globals" />

/**
 * "Has this loaded once" versus "is this loading right now".
 *
 * A watched query re-runs whenever a table it reads is written, and its loading
 * flag goes back up while it does. A surface gated on the raw flag falls back to
 * a skeleton every time anything underneath it changes, so returning to a screen
 * looks like opening it for the first time.
 *
 * The rule is one-way on purpose — which is both the point and the thing that
 * could regress without anyone noticing.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useSettled } from "@/hooks/use-settled";

function Probe({ pending }: { pending: boolean }) {
  return <span>{String(useSettled(pending))}</span>;
}

let container: HTMLDivElement;
let root: Root;

/** Renders the sequence as successive re-renders, collecting what it reported. */
const drive = (sequence: boolean[]): string[] =>
  sequence.map((pending) => {
    act(() => root.render(<Probe pending={pending} />));
    return container.textContent ?? "";
  });

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("useSettled", () => {
  it("is settled from the first render when nothing was pending", () => {
    expect(drive([false])).toEqual(["true"]);
  });

  it("waits while the first load is pending", () => {
    expect(drive([true, true, false])).toEqual(["false", "false", "true"]);
  });

  it("stays settled when a later re-run goes pending again", () => {
    // The regression this exists to prevent: a block write re-runs the query,
    // and the screen must not fall back to a skeleton.
    expect(drive([true, false, true, true])).toEqual(["false", "true", "true", "true"]);
  });
});

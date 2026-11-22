/// <reference types="vitest/globals" />

/**
 * The year views' flag — the control that reveals a year's highlights.
 *
 * It carries the year's count so the flag says something when it is off. At zero
 * it must carry nothing: a flag with a "0" beside it reads as a broken counter,
 * and "no highlights this year" is already the message.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { YearPinsToggle, YearViewControls } from "@/components/tracker/YearViewControls";

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

describe("the year flag", () => {
  it("shows the year's count when it has highlights", () => {
    const el = render(<YearPinsToggle pinCount={3} pinsOpen={false} onToggle={() => {}} />);
    expect(el.textContent).toBe("3");
  });

  it("shows the flag alone at zero, with no number", () => {
    const el = render(<YearPinsToggle pinCount={0} pinsOpen={false} onToggle={() => {}} />);
    expect(el.querySelector("svg")).not.toBeNull();
    expect(/\d/.test(el.textContent ?? "")).toBe(false);
  });

  it("names itself by what the toggle does, not by its count", () => {
    const closed = render(<YearPinsToggle pinCount={3} pinsOpen={false} onToggle={() => {}} />);
    expect(closed.querySelector("[aria-pressed='false']")?.getAttribute("aria-label")).toBe("Show highlights");

    const open = render(<YearViewControls pinCount={3} pinsOpen onTogglePins={() => {}} onOpenInsights={() => {}} />);
    expect(open.querySelector("[aria-pressed='true']")?.getAttribute("aria-label")).toBe("Hide highlights");
  });

  it("keeps the count on the mobile group's flag too, and drops the zero there", () => {
    const withCount = render(
      <YearViewControls pinCount={2} pinsOpen={false} onTogglePins={() => {}} onOpenInsights={() => {}} mounted />,
    );
    expect([...withCount.querySelectorAll("button")].map((b) => b.textContent?.trim())).toContain("2");

    const atZero = render(<YearViewControls pinCount={0} pinsOpen={false} onTogglePins={() => {}} onOpenInsights={() => {}} mounted />);
    const flag = [...atZero.querySelectorAll("button")].find((b) => b.getAttribute("aria-pressed") !== null);
    expect(/\d/.test(flag?.textContent ?? "")).toBe(false);
  });
});

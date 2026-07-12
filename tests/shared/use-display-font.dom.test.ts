/// <reference types="vitest/globals" />

import { act } from "react";
import { renderHook } from "@testing-library/react";

import { useDisplayFont } from "@/hooks/use-display-font";
import { DISPLAY_FONT_STORAGE_KEY } from "@/lib/shared/display-font";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useDisplayFont", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.removeAttribute("data-display-font");
  });

  it("defaults to fraunces when nothing is stored", () => {
    const { result } = renderHook(() => useDisplayFont());
    expect(result.current.font).toBe("fraunces");
  });

  it("reads the stored font on mount", () => {
    localStorage.setItem(DISPLAY_FONT_STORAGE_KEY, "hanken");
    const { result } = renderHook(() => useDisplayFont());
    expect(result.current.font).toBe("hanken");
  });

  it("ignores an invalid stored value and falls back to the default", () => {
    localStorage.setItem(DISPLAY_FONT_STORAGE_KEY, "not-a-font");
    const { result } = renderHook(() => useDisplayFont());
    expect(result.current.font).toBe("fraunces");
  });

  it("persists a non-default choice and sets the body attribute", () => {
    const { result } = renderHook(() => useDisplayFont());
    act(() => result.current.setFont("bricolage"));

    expect(result.current.font).toBe("bricolage");
    expect(localStorage.getItem(DISPLAY_FONT_STORAGE_KEY)).toBe("bricolage");
    expect(document.body.getAttribute("data-display-font")).toBe("bricolage");
  });

  it("clears the body attribute when the default is re-selected", () => {
    const { result } = renderHook(() => useDisplayFont());

    act(() => result.current.setFont("lora"));
    expect(document.body.getAttribute("data-display-font")).toBe("lora");

    act(() => result.current.setFont("fraunces"));
    expect(document.body.hasAttribute("data-display-font")).toBe(false);
    expect(localStorage.getItem(DISPLAY_FONT_STORAGE_KEY)).toBe("fraunces");
  });
});

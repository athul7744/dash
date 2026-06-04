/// <reference types="vitest/globals" />

import { act } from "react";
import { renderHook } from "@testing-library/react";

import { useOptimisticValue } from "@/hooks/use-optimistic-value";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useOptimisticValue", () => {
  it("returns the upstream value initially", () => {
    const { result } = renderHook(({ upstream }) => useOptimisticValue(upstream), {
      initialProps: { upstream: "a" },
    });

    expect(result.current[0]).toBe("a");
  });

  it("reflects an optimistic value immediately, before upstream changes", () => {
    const { result } = renderHook(({ upstream }) => useOptimisticValue(upstream), {
      initialProps: { upstream: "a" },
    });

    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
  });

  it("clears the optimistic value once the upstream catches up", () => {
    const { result, rerender } = renderHook(({ upstream }) => useOptimisticValue(upstream), {
      initialProps: { upstream: "a" },
    });

    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");

    // Upstream now reports the same value the optimistic write produced.
    rerender({ upstream: "b" });
    expect(result.current[0]).toBe("b");
  });

  it("keeps the optimistic value across reference-only upstream changes (no flicker)", () => {
    const { result, rerender } = renderHook(({ upstream }) => useOptimisticValue(upstream), {
      initialProps: { upstream: ["t1"] as string[] },
    });

    act(() => result.current[1](["t1", "t2"]));
    expect(result.current[0]).toEqual(["t1", "t2"]);

    // A fresh array with identical contents (e.g. a re-parsed query row) must NOT
    // reset the optimistic value — only a genuine content change should.
    rerender({ upstream: ["t1"] });
    expect(result.current[0]).toEqual(["t1", "t2"]);
  });

  it("clears the optimistic value when upstream content genuinely changes", () => {
    const { result, rerender } = renderHook(({ upstream }) => useOptimisticValue(upstream), {
      initialProps: { upstream: ["t1"] as string[] },
    });

    act(() => result.current[1](["t1", "t2"]));
    expect(result.current[0]).toEqual(["t1", "t2"]);

    // Upstream changed to something different from the optimistic value — adopt it.
    rerender({ upstream: ["t3"] });
    expect(result.current[0]).toEqual(["t3"]);
  });
});

/// <reference types="vitest/globals" />

/**
 * When the app is allowed to buzz.
 *
 * `navigator.vibrate` doesn't exist on iOS at all, so every guard here has to
 * hold on a device that can't do this — a throw from a haptic would take the
 * action it was decorating down with it.
 */

import { haptic } from "@/lib/shared/haptics";

const setup = ({ vibrate, reduceMotion }: { vibrate?: unknown; reduceMotion?: boolean } = {}) => {
  const calls: unknown[] = [];
  vi.stubGlobal("navigator", {
    vibrate: vibrate === undefined
      ? (pattern: unknown) => {
          calls.push(pattern);
          return true;
        }
      : vibrate,
  });
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: Boolean(reduceMotion) && query.includes("reduce") }),
  });
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe("haptic", () => {
  it("buzzes for an action that changed something", () => {
    const calls = setup();
    haptic();
    expect(calls).toEqual([10]);
  });

  it("uses a distinct pattern for something put away", () => {
    const calls = setup();
    haptic("undoable");
    expect(calls).toEqual([[12, 40, 12]]);
  });

  it("stays quiet when the device has no vibration at all", () => {
    // Every iPhone, in a PWA or otherwise.
    const calls = setup({ vibrate: undefined as never });
    vi.stubGlobal("navigator", {});
    expect(() => haptic()).not.toThrow();
    expect(calls).toEqual([]);
  });

  it("stays quiet when the user asked for less motion", () => {
    // There is no "reduce haptics" query, and someone who wants less movement
    // does not want their phone twitching either.
    const calls = setup({ reduceMotion: true });
    haptic();
    expect(calls).toEqual([]);
  });

  it("survives a device that refuses", () => {
    setup({
      vibrate: () => {
        throw new Error("blocked");
      },
    });
    expect(() => haptic()).not.toThrow();
  });
});

/// <reference types="vitest/globals" />

/**
 * When a waiting version may be taken without asking.
 *
 * The rest of the update layer is service-worker plumbing; this is the judgement
 * in it. Reloading is destructive to whatever is on screen, so the bar for doing
 * it unannounced is that nobody was looking *and* nothing was mid-save — the
 * second because a reload during a debounce drops an edit the user believes is
 * already written.
 */

import { AWAY_BEFORE_SILENT_UPDATE_MS, shouldUpdateSilently } from "@/lib/shared/app-update";

describe("shouldUpdateSilently", () => {
  it("takes it when you have been away a while", () => {
    expect(shouldUpdateSilently({ hiddenForMs: AWAY_BEFORE_SILENT_UPDATE_MS, hasUnsavedWork: false })).toBe(true);
    expect(shouldUpdateSilently({ hiddenForMs: 60 * 60_000, hasUnsavedWork: false })).toBe(true);
  });

  it("asks first when you only glanced away", () => {
    // Switching to another app to copy a link, and straight back. Reloading
    // under that is indistinguishable from a crash.
    expect(shouldUpdateSilently({ hiddenForMs: 5_000, hasUnsavedWork: false })).toBe(false);
    expect(shouldUpdateSilently({ hiddenForMs: AWAY_BEFORE_SILENT_UPDATE_MS - 1, hasUnsavedWork: false })).toBe(false);
  });

  it("never takes it over unsaved work, however long you were gone", () => {
    // Writes are debounced, so "unsaved" here means typed but not yet written —
    // exactly what a reload would lose, and exactly what the user thinks is safe.
    expect(shouldUpdateSilently({ hiddenForMs: 24 * 60 * 60_000, hasUnsavedWork: true })).toBe(false);
  });

  it("treats a first visibility change as no time away", () => {
    // Nothing was recorded as hidden, so there is no gap to reason about.
    expect(shouldUpdateSilently({ hiddenForMs: 0, hasUnsavedWork: false })).toBe(false);
  });
});

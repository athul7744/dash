"use client";

/**
 * Has this finished loading at least once?
 *
 * A watched query re-runs whenever a table it reads changes, and its `isLoading`
 * goes back up while it does. Gating a surface on that raw flag means the whole
 * screen falls back to a skeleton every time anything underneath it is written —
 * which is what made returning to a screen feel like opening it for the first
 * time, rather than coming back to something already there.
 *
 * A surface should wait for its data once. After that, it has data: it can show
 * the previous values until new ones arrive, which is what "instant" is made of.
 *
 * Adjusted during render rather than in an effect, so the first paint that has
 * data is already the settled one — an effect would paint the skeleton once more
 * before clearing it.
 */

import { useState } from "react";

export function useSettled(pending: boolean): boolean {
  const [settled, setSettled] = useState(!pending);
  if (!settled && !pending) setSettled(true);
  return settled;
}

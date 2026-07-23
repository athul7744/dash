"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The debounced save-on-blur machinery shared by the bookmark, quote, and
 * reminder cards. Each card keeps its own local field state and reconciles
 * remote changes only while `focusedRef` is false (so a sync can't yank the
 * caret mid-edit); this hook owns the parts that were hand-rolled identically in
 * all three: the focus flag, the debounce timer, its unmount cleanup, and the
 * schedule/flush pair.
 *
 * `schedule(task)` debounces `task`; `flush(task)` marks the card unfocused,
 * cancels any pending save, and runs `task` now (call on blur). Pass the persist
 * work as a thunk so cards with more than one saved field can reuse one timer.
 */
export function useDebouncedSave(debounceMs = 600) {
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const schedule = useCallback(
    (task: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(task, debounceMs);
    },
    [debounceMs],
  );

  const flush = useCallback((task: () => void) => {
    focusedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    task();
  }, []);

  return { focusedRef, schedule, flush };
}

import { useCallback } from "react";

import { useDerivedState } from "@/hooks/use-derived-state";

/**
 * Optimistic override for values that are edited locally but owned by an
 * upstream source (e.g. a reactive DB query). Returns the latest local value so
 * edits reflect immediately, before the write round-trips back through the
 * upstream.
 *
 * The override is keyed on a serialized snapshot of the upstream value (not its
 * object reference, which may be re-created every render) so it clears only once
 * the upstream actually changes — avoiding flicker where a fresh object
 * reference would otherwise reset the optimistic value before the write lands.
 */
export function useOptimisticValue<T>(upstream: T): [T, (next: T) => void] {
  const upstreamKey = JSON.stringify(upstream ?? null);
  const [optimistic, setOptimistic] = useDerivedState<string, { value: T } | null>(upstreamKey, () => null);
  const setOptimisticValue = useCallback((next: T) => setOptimistic({ value: next }), [setOptimistic]);
  return [optimistic ? optimistic.value : upstream, setOptimisticValue];
}

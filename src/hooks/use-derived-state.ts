import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * Local, editable state seeded from `source` that re-syncs whenever `source`
 * changes — the React-endorsed "adjust state during render" alternative to a
 * `setState`-in-effect (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
 *
 * `source` must be a primitive (or otherwise stable-valued) so the change check
 * settles in one extra render instead of looping. `transform` maps it to the
 * state shape. Local edits via the returned setter survive until `source`
 * itself changes.
 */
export function useDerivedState<S, T>(
  source: S,
  transform: (source: S) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => transform(source));
  const [prevSource, setPrevSource] = useState(source);

  if (!Object.is(prevSource, source)) {
    setPrevSource(source);
    setState(transform(source));
  }

  return [state, setState];
}

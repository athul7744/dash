import * as React from "react"

/**
 * Whether the viewport matches `query`, kept live.
 *
 * Read through `useSyncExternalStore` because that is what a media query is: an
 * external source with a subscription and a current value. Setting state from an
 * effect instead meant the first render always answered `false` and corrected
 * itself after paint, so anything switching layout on a breakpoint rendered the
 * wrong one for a frame.
 *
 * The server has no viewport, so it answers `false` — and React re-checks on the
 * client after hydration.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const result = matchMedia(query)
      result.addEventListener("change", onChange)
      return () => result.removeEventListener("change", onChange)
    },
    [query],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => matchMedia(query).matches,
    () => false,
  )
}

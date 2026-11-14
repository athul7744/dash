"use client";

import { useEffect, type RefObject } from "react";

/**
 * Mark which ends of a horizontal scroller have more content, for the `.pill-scroller`
 * fade fallback.
 *
 * The fade itself is driven by `animation-timeline: scroll(self inline)`, which
 * needs no JavaScript and is inert when the content fits. Browsers without
 * scroll-driven animations would then show no hint at all — and the app hides
 * scrollbars, so that hint is the only cue a row scrolls. There, observe the
 * first and last child: one that isn't fully visible means there is more beyond
 * that edge. `rootMargin: 1px` absorbs sub-pixel widths leaving an edge child a
 * fraction short of fully visible.
 *
 * Bound to the child count, since the pills it observes are re-created whenever
 * a filter changes.
 */
export function useScrollAffordance(ref: RefObject<HTMLElement | null>, childCount: number): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;
    if (typeof CSS === "undefined" || CSS.supports("animation-timeline", "scroll()")) return;

    const first = scroller.firstElementChild;
    const last = scroller.lastElementChild;
    if (!first || !last) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, intersectionRatio } of entries) {
          scroller.classList.toggle(target === first ? "more-start" : "more-end", intersectionRatio < 1);
        }
      },
      { root: scroller, threshold: 1, rootMargin: "1px" },
    );
    observer.observe(first);
    observer.observe(last);
    return () => observer.disconnect();
  }, [ref, childCount]);
}

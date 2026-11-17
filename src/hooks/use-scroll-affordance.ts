"use client";

import { useEffect, type RefObject } from "react";

/**
 * Mark which ends of a horizontal scroller have more content, for the
 * `.pill-scroller` fade.
 *
 * Observe the first and last child: one that isn't fully visible means there is
 * more beyond that edge, and the row's fade bands follow the classes this sets.
 * An observer rather than a scroll-driven animation, because the timeline keeps
 * its last progress when a row stops overflowing — the band stayed painted on
 * the wrong side until something scrolled again. `rootMargin: 1px` absorbs
 * sub-pixel widths leaving an edge child a fraction short of fully visible.
 *
 * Bound to the child count, since the pills it observes are re-created whenever
 * a filter changes.
 */
export function useScrollAffordance(ref: RefObject<HTMLElement | null>, childCount: number): void {
  useEffect(() => {
    const scroller = ref.current;
    if (!scroller) return;

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

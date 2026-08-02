"use client";

import { useEffect, useRef } from "react";

/**
 * Fires `onLoadMore` when a sentinel element nears the viewport, for infinite
 * scroll. Returns a ref to attach to the sentinel (render it at the end of the
 * list). `enabled` gates the observer — pass `hasMore && !loading` so it stops at
 * the end and never grows mid-fetch. The 800px margin pre-loads before the user
 * hits the bottom. `root: null` (viewport) works with nested scroll containers.
 */
export function useInfiniteScroll(onLoadMore: () => void, enabled: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest callback without re-observing on every render.
  const cb = useRef(onLoadMore);
  useEffect(() => { cb.current = onLoadMore; });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) cb.current(); },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  return sentinelRef;
}

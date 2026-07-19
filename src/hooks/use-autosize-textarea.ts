"use client";

import { useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";

/**
 * Grow a textarea to fit its content — no inner scrollbar, no clipping.
 *
 * Height is recomputed before paint whenever the value changes, and again when
 * the element's *width* changes (responsive breakpoints, masonry column
 * reflow), since a narrower box wraps to more lines. Width-only observation
 * avoids the height-feedback loop a naive ResizeObserver would hit.
 */
export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? lastWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}

"use client";

/**
 * `useNearViewport` — perf primitive for the single-document editor.
 *
 * ProseMirror keeps the whole document in the DOM, so the cost that used to be
 * virtualized away (per-block editor mounting) reappears in the heavy React
 * NodeViews (KaTeX math, lowlight code highlighting, live-SQL query blocks).
 * This hook lets each heavy NodeView render a cheap placeholder until it nears
 * the viewport, then hydrate — bounding the expensive work to what's visible
 * while the block itself (and its position/selection) stays in the doc.
 *
 * Uses ONE shared IntersectionObserver for all blocks (cheaper than one per
 * block on long pages) and latches to `true` once shown, so scrolling back and
 * forth doesn't thrash mount/unmount.
 */

import { useEffect, useRef, useState } from "react";

type Callback = (isNear: boolean) => void;

let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, Callback>();

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = callbacks.get(entry.target);
          if (cb) {
            cb(true);
            sharedObserver?.unobserve(entry.target);
            callbacks.delete(entry.target);
          }
        }
      },
      // Generous margin so content hydrates just before it scrolls into view.
      { rootMargin: "400px 0px" },
    );
  }
  return sharedObserver;
}

export function useNearViewport<T extends HTMLElement = HTMLElement>(): {
  ref: (node: T | null) => void;
  isNear: boolean;
} {
  // No IntersectionObserver (SSR / jsdom) → render everything eagerly.
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === "undefined");
  const elementRef = useRef<T | null>(null);
  const nearRef = useRef(false);

  useEffect(() => {
    const observer = getObserver();
    if (!observer) return; // already eager from the initial state
    const element = elementRef.current;
    if (!element || nearRef.current) return;

    callbacks.set(element, () => {
      nearRef.current = true;
      setIsNear(true);
    });
    observer.observe(element);
    return () => {
      observer.unobserve(element);
      callbacks.delete(element);
    };
  }, []);

  const ref = (node: T | null) => {
    elementRef.current = node;
  };

  return { ref, isNear };
}

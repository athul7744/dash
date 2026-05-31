"use client";

import { useRef } from "react";

const MOBILE_EDGE_SWIPE_TRIGGER_PX = 56;
const MOBILE_EDGE_SWIPE_MAX_VERTICAL_DRIFT_PX = 48;

type EdgeSwipeCallbacks = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
};

export function useEdgeSwipe(
  enabled: boolean,
  callbacks: EdgeSwipeCallbacks,
) {
  const edgeSwipeStartRef = useRef<{ x: number; y: number; edge: "left" | "right" } | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!enabled) {
      edgeSwipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      edgeSwipeStartRef.current = null;
      return;
    }

    // Ignore swipes starting on horizontally scrollable containers (e.g. title/tag row)
    let el = event.target as HTMLElement | null;
    while (el && el !== event.currentTarget) {
      const touchAction = getComputedStyle(el).touchAction;
      if (touchAction === "pan-x" || el.scrollWidth > el.clientWidth + 1) {
        edgeSwipeStartRef.current = null;
        return;
      }
      el = el.parentElement;
    }

    const { clientX, clientY } = touch;
    const viewportWidth = window.innerWidth;
    const edgeZone = viewportWidth / 3;

    if (clientX <= edgeZone) {
      edgeSwipeStartRef.current = { x: clientX, y: clientY, edge: "left" };
      return;
    }

    if (clientX >= viewportWidth - edgeZone) {
      edgeSwipeStartRef.current = { x: clientX, y: clientY, edge: "right" };
      return;
    }

    edgeSwipeStartRef.current = null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const swipeStart = edgeSwipeStartRef.current;
    edgeSwipeStartRef.current = null;

    if (!swipeStart || !enabled) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - swipeStart.x;
    const deltaY = Math.abs(touch.clientY - swipeStart.y);
    if (deltaY > MOBILE_EDGE_SWIPE_MAX_VERTICAL_DRIFT_PX) {
      return;
    }

    if (swipeStart.edge === "left" && deltaX >= MOBILE_EDGE_SWIPE_TRIGGER_PX) {
      callbacks.onSwipeLeft();
      return;
    }

    if (swipeStart.edge === "right" && deltaX <= -MOBILE_EDGE_SWIPE_TRIGGER_PX) {
      callbacks.onSwipeRight();
    }
  };

  return {
    handleTouchStart,
    handleTouchEnd,
  };
}

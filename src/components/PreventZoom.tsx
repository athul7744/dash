"use client";

import { useEffect } from "react";

/**
 * Block two-finger zoom, which the viewport meta (`maximum-scale=1`) can't cover:
 * iOS Safari ignores `user-scalable=no` and pinches via non-standard `gesture*`
 * events, and desktop trackpad pinch arrives as a ctrl+wheel. `touch-action`
 * (globals.css) handles the rest. Renders nothing.
 */
export function PreventZoom() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault(); // trackpad pinch = ctrl+wheel
    };
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    document.addEventListener("gestureend", stop);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return null;
}

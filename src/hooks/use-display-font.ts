"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_DISPLAY_FONT,
  DISPLAY_FONT_STORAGE_KEY,
  isDisplayFont,
  type DisplayFont,
} from "@/lib/shared/display-font";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): DisplayFont {
  const stored = localStorage.getItem(DISPLAY_FONT_STORAGE_KEY);
  return isDisplayFont(stored) ? stored : DEFAULT_DISPLAY_FONT;
}

function getServerSnapshot(): DisplayFont {
  return DEFAULT_DISPLAY_FONT;
}

/**
 * Reads/writes the selected display font. The live value is applied to
 * <html data-display-font> before paint by an inline script in the layout;
 * this hook mirrors it for the Settings UI (via useSyncExternalStore, so the
 * hydration snapshot matches the server) and persists changes.
 */
export function useDisplayFont() {
  const font = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setFont = useCallback((next: DisplayFont) => {
    try {
      localStorage.setItem(DISPLAY_FONT_STORAGE_KEY, next);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
    // Set on <body>, where the per-font --font-* vars are defined (see globals.css).
    if (next === DEFAULT_DISPLAY_FONT) {
      document.body.removeAttribute("data-display-font");
    } else {
      document.body.setAttribute("data-display-font", next);
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { font, setFont };
}

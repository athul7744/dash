import { MotionGlobalConfig } from "motion/react";

/**
 * jsdom setup shared by the DOM test project. jsdom does not implement
 * `window.matchMedia`, which Motion's `useReducedMotion()` calls — stub it so
 * components that animate can mount under test. Defaults to "no preference"
 * (motion enabled); individual tests can override `matchMedia` if needed.
 */

// Make Motion resolve animations instantly under test: jsdom never advances the
// frameloop, so AnimatePresence exits would otherwise linger and keep exiting
// nodes mounted. Skipping animations lets enter/exit complete synchronously.
MotionGlobalConfig.skipAnimations = true;

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * The app's shared motion vocabulary — the single source of truth for the feel
 * of every Motion animation, mirrored by the CSS custom properties in
 * `globals.css`. Calm and subtle by design: short durations, the house easing
 * curve, and small offsets.
 *
 * Deliberately free of any `motion/react` import so it stays pure and
 * unit-testable in a node environment; the exported objects are structurally
 * compatible with Motion's `variants` / `transition` props at each call site.
 */

/** Seconds. Mirrors `--motion-duration-*` in globals.css. */
export const DURATION = {
  fast: 0.12,
  base: 0.2,
  slow: 0.4,
} as const;

/** Cubic-bezier control points. Mirrors `--motion-ease-*` in globals.css. */
export const EASE = {
  /** The house curve — entrances and moves. */
  standard: [0.2, 0.9, 0.2, 1] as [number, number, number, number],
  /** Slightly sharper tail — exits. */
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
};

/** Stagger step between list children, in seconds. */
export const STAGGER_STEP = 0.024;

/** A calm spring for micro-interactions (taps, checkmarks, dots). */
export const SPRING_SOFT = { type: "spring" as const, stiffness: 320, damping: 30 };

/** Standard entrance: fade + small upward translate. The default everywhere. */
export const fadeSlideUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.standard } },
  exit: { opacity: 0, y: 4, transition: { duration: DURATION.base, ease: EASE.exit } },
};

/** Container that staggers its children's entrance/exit. */
export const staggerContainer = {
  animate: { transition: { staggerChildren: STAGGER_STEP } },
  exit: { transition: { staggerChildren: STAGGER_STEP / 2, staggerDirection: -1 } },
};

/** Item variant for a {@link staggerContainer} — inherits the standard entrance. */
export const staggerItem = fadeSlideUp;

/** Enter/exit for hand-rolled popovers (fade + gentle zoom from the anchor). */
export const popoverPresence = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DURATION.fast, ease: EASE.exit } },
};

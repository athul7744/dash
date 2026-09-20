"use client";

/**
 * A short buzz on the actions that change something.
 *
 * The part of "feels native" that has nothing to do with looks: a native
 * checkbox answers your thumb, a web one doesn't. Kept deliberately sparse —
 * haptics stop meaning anything if everything buzzes, so this is for actions
 * that commit a change, never for navigation or opening a menu.
 *
 * `navigator.vibrate` is Android and desktop Chrome only. iOS has no API for
 * this at all, in a PWA or otherwise, so every call is a no-op there and the
 * feature has to be a bonus rather than the feedback itself — anything that
 * buzzes must also show what happened.
 */

/** Patterns, in milliseconds. Short enough to register as texture, not a buzz. */
const PATTERNS = {
  /** A state changed: a task ticked, a cell painted. */
  tap: 10,
  /** Something was put away and can be brought back. */
  undoable: [12, 40, 12],
  /** A refusal — nothing happened, and you should notice. */
  refused: [24, 60, 24],
} as const;

export type HapticKind = keyof typeof PATTERNS;

/**
 * Whether to stay quiet.
 *
 * There is no "reduce haptics" media query, so reduced-motion stands in for it:
 * someone who has asked the system for less movement is the same person who
 * doesn't want their phone twitching, and it means the escape hatch is one they
 * already have rather than another setting to find.
 */
function silenced(): boolean {
  if (typeof window === "undefined" || typeof navigator.vibrate !== "function") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Buzz, if this device can and the user hasn't asked it not to. */
export function haptic(kind: HapticKind = "tap"): void {
  if (silenced()) return;
  try {
    navigator.vibrate(PATTERNS[kind] as number | number[]);
  } catch {
    /* a device that refuses is no worse off than one that can't */
  }
}

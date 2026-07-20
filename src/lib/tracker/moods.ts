import { ACTIVITY_COLORS, getActivityDotClass } from "@/lib/tracker/activities";
import { COLOR_HEX } from "@/components/tracker/widgets/types";

/**
 * Moods are a user-configurable, ordered scale stored in the `moods` table.
 * Each mood has a `value` (its ordinal, worst→best) which is the number stored
 * in `daily_ratings.score` — so a rating references a mood by value, and the
 * scale can be any length. Colors reuse the tracker's activity color system.
 */
export interface Mood {
  id: string;
  label: string;
  color: string; // a color name from ACTIVITY_COLORS
  value: number;
}

/** Moods reuse the tracker's activity color palette. */
export const MOOD_COLORS = ACTIVITY_COLORS;

/** Default 5-mood scale (worst→best) seeded on first run. */
export const DEFAULT_MOODS: { label: string; color: string; value: number }[] = [
  { label: "Rough", color: "orange", value: 1 },
  { label: "Low", color: "yellow", value: 2 },
  { label: "Okay", color: "lime", value: 3 },
  { label: "Good", color: "emerald", value: 4 },
  { label: "Great", color: "blue", value: 5 },
];

/** The mood at a given rating value, or null if none is configured for it. */
export function moodByValue(moods: Mood[], value: number | null | undefined): Mood | null {
  if (value == null) return null;
  return moods.find((m) => m.value === value) ?? null;
}

/** Hex for a mood's color (for SVG/inline-style fills), with a neutral fallback. */
export function moodHex(mood: Mood | null): string {
  if (!mood) return COLOR_HEX.slate;
  return COLOR_HEX[mood.color] ?? COLOR_HEX.slate;
}

/** Tailwind dot class for a mood's color. */
export function moodDotClass(mood: Mood | null): string {
  return getActivityDotClass(mood?.color ?? "slate");
}

export interface MoodRange {
  min: number;
  max: number;
  mid: number;
}

/** The configured scale's bounds. Falls back to a 1–5 range when empty. */
export function moodRange(moods: Mood[]): MoodRange {
  if (moods.length === 0) return { min: 1, max: 5, mid: 3 };
  const values = moods.map((m) => m.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, mid: (min + max) / 2 };
}

export type MoodTier = "good" | "bad" | "neutral";

/**
 * Classify a rating value into good/bad/neutral relative to the configured
 * range (higher = better). Reproduces the old ≥4 / ≤2 split on a 1–5 scale
 * (top/bottom 40% of the range) but adapts to any range.
 */
export function moodTier(value: number, range: MoodRange): MoodTier {
  const span = range.max - range.min;
  if (span <= 0) return "neutral";
  const band = span * 0.4;
  if (value >= range.max - band) return "good";
  if (value <= range.min + band) return "bad";
  return "neutral";
}

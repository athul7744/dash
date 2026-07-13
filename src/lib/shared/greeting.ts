/**
 * Rotating, time-of-day-appropriate greetings for the dashboard.
 *
 * Kept pure (no `Date`/`Math.random` at module or function scope) so it is
 * trivially unit-testable: callers pass the hour and a rotation index. The
 * dashboard supplies a random index at mount so the greeting varies each open.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// Gentle, calm variants — never peppy. Each pool has a plain first entry so
// index 0 is always a safe, conventional greeting.
const GREETINGS: Record<TimeOfDay, string[]> = {
  morning: ["Good morning", "A fresh start", "Ease into the day", "Here's to today", "A new page"],
  afternoon: ["Good afternoon", "Hope it's going well", "Afternoon calm", "Keep your rhythm", "Steady as you go"],
  evening: ["Good evening", "Winding down", "Evening calm", "Ease into the evening", "Time to slow down"],
  night: ["Still up?", "A quiet night", "Late one tonight", "Rest soon", "The quiet hours"],
};

// Small reflective sub-lines (rendered in the serif voice). Kept short.
const SUBLINES: string[] = [
  "What matters today?",
  "One thing at a time.",
  "Take it easy.",
  "Ease into it.",
  "Small steps count.",
];

function pick<T>(pool: T[], index: number): T {
  const len = pool.length;
  return pool[((index % len) + len) % len];
}

export function greetingForHour(hour: number, index = 0): string {
  return pick(GREETINGS[timeOfDayForHour(hour)], index);
}

export function sublineForIndex(index = 0): string {
  return pick(SUBLINES, index);
}

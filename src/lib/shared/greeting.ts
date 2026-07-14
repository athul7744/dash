/**
 * Rotating, time-of-day-appropriate greetings for the dashboard.
 *
 * Kept pure (no `Date`/`Math.random` at module or function scope) so it is
 * trivially unit-testable: callers pass the hour and a rotation index. The
 * dashboard supplies a random index at mount so the greeting varies each open.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night" | "lateNight";

export function timeOfDayForHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  if (hour >= 0 && hour < 3) return "lateNight"; // 12am–3am: sleep hours
  return "night";
}

// Gentle, calm variants — never peppy. Each pool has a plain first entry so
// index 0 is always a safe, conventional greeting.
const GREETINGS: Record<TimeOfDay, string[]> = {
  morning: ["Good morning", "A fresh start", "Ease into the day", "Here's to today", "A new page"],
  afternoon: ["Good afternoon", "Hope it's going well", "Afternoon calm", "Keep your rhythm", "Steady as you go"],
  evening: ["Good evening", "Easing off", "The day's winding down", "Shifting down a gear", "Nearly done"],
  night: ["Good night", "Winding down", "Time to slow down", "The day is done", "The quiet hours"],
  lateNight: ["Time to sleep", "Still awake?", "Get some rest", "Past bedtime", "The night is deep"],
};

// Small reflective sub-lines (rendered in the serif voice), one pool per time of
// day. Kept short; index 0 in each pool is a safe, plain default.
const SUBLINES: Record<TimeOfDay, string[]> = {
  morning: [
    "What matters today?",
    "One thing at a time.",
    "Ease into it.",
    "A fresh page awaits.",
    "Start where you are.",
    "Small steps count.",
  ],
  afternoon: [
    "Keep your rhythm.",
    "How's it going?",
    "Steady as you go.",
    "Stay with it.",
    "One thing at a time.",
    "A calm middle.",
  ],
  evening: [
    "Wrapping up?",
    "Ease off the pace.",
    "The day's nearly done.",
    "Start to wind down.",
    "One last stretch.",
    "A calm finish.",
  ],
  night: [
    "How was today?",
    "Time to slow down.",
    "Let the day settle.",
    "Wind it down.",
    "You did enough.",
    "Ease off now.",
  ],
  lateNight: [
    "Rest will help.",
    "Sleep is waiting.",
    "Tomorrow needs you rested.",
    "Close your eyes soon.",
    "Give yourself the night.",
    "Let today go.",
  ],
};

function pick<T>(pool: T[], index: number): T {
  const len = pool.length;
  return pool[((index % len) + len) % len];
}

export function greetingForHour(hour: number, index = 0): string {
  return pick(GREETINGS[timeOfDayForHour(hour)], index);
}

export function sublineForHour(hour: number, index = 0): string {
  return pick(SUBLINES[timeOfDayForHour(hour)], index);
}

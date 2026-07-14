import type { TimeOfDay } from "@/lib/shared/greeting";

/**
 * The hero's "next best action" picker — a small rule + weighted-score model.
 * Each candidate has an eligibility gate and a score of
 *   AFFINITY[timeOfDay][kind] + needBoost(kind, signals);
 * the highest eligible score wins, tie-broken by TIE_BREAK order. Pure and
 * deterministic so it is unit-testable and easy to tune.
 */

/** Kinds that go through the weighted-score picker. */
type ScoredKind = "task" | "plan" | "track" | "journal" | "mood";

/**
 * All hero outcomes. Beyond the scored kinds: `moodYesterday` (late-night
 * catch-up on the previous day's mood) and `none` (render nothing).
 */
export type HeroActionKind = ScoredKind | "moodYesterday" | "none";

export interface HeroSignals {
  timeOfDay: TimeOfDay;
  pendingCount: number;
  overdueCount: number;
  dueTodayCount: number;
  /** Any tracker time logged in the last ~2 hours. */
  loggedRecently: boolean;
  moodRatedToday: boolean;
  /** Whether yesterday's mood was rated (drives the late-night catch-up). */
  moodRatedYesterday: boolean;
  journalWrittenThisWeek: boolean;
}

const AFFINITY: Record<TimeOfDay, Record<ScoredKind, number>> = {
  morning: { task: 8, plan: 5, track: 3, journal: 2, mood: 0 },
  afternoon: { task: 6, plan: 3, track: 8, journal: 3, mood: 0 },
  evening: { task: 4, plan: 2, track: 3, journal: 8, mood: 0 },
  night: { task: 2, plan: 1, track: 1, journal: 6, mood: 8 },
  // Late night bypasses scoring (see chooseHeroAction); kept for exhaustiveness.
  lateNight: { task: 0, plan: 0, track: 0, journal: 0, mood: 0 },
};

// Higher = wins ties. Mood first (night check-in is deliberate), then work.
const TIE_BREAK: ScoredKind[] = ["mood", "task", "journal", "track", "plan"];

function isEligible(kind: ScoredKind, s: HeroSignals): boolean {
  switch (kind) {
    case "task":
      return s.pendingCount > 0;
    case "plan":
      return true; // always available as a fallback
    case "track":
      return !s.loggedRecently;
    case "journal":
      return !s.journalWrittenThisWeek;
    case "mood":
      return s.timeOfDay === "night" && !s.moodRatedToday;
  }
}

function needBoost(kind: ScoredKind, s: HeroSignals): number {
  switch (kind) {
    case "task":
      return s.overdueCount > 0 ? 6 : s.dueTodayCount > 0 ? 3 : 0;
    case "plan":
      return s.pendingCount === 0 ? 2 : 0;
    case "track":
      return 5; // a 2h+ gap is an important nudge
    case "journal":
      return 3;
    case "mood":
      return 0;
  }
}

export function chooseHeroAction(signals: HeroSignals): HeroActionKind {
  // Late night (12am–3am): only nudge to rate yesterday's mood if it's missing,
  // otherwise stay quiet so the hero doesn't push work at sleep hours.
  if (signals.timeOfDay === "lateNight") {
    return signals.moodRatedYesterday ? "none" : "moodYesterday";
  }

  const kinds: ScoredKind[] = ["task", "plan", "track", "journal", "mood"];

  let best: ScoredKind = "plan";
  let bestScore = -Infinity;

  for (const kind of kinds) {
    if (!isEligible(kind, signals)) continue;
    const score = AFFINITY[signals.timeOfDay][kind] + needBoost(kind, signals);
    if (
      score > bestScore ||
      (score === bestScore && TIE_BREAK.indexOf(kind) < TIE_BREAK.indexOf(best))
    ) {
      best = kind;
      bestScore = score;
    }
  }

  return best;
}

/**
 * One day's logged hours, rolled up by activity.
 *
 * Three surfaces need exactly this — both year grids' day popovers and the Day
 * surface — and each had grown its own copy, down to the sort-and-flatten that
 * feeds `DayPopover`. Pure: the caller supplies the lookup, so it works over
 * whichever cell map it happens to hold.
 */

import { hourCellKey } from "./day-keys";

export interface DayActivity {
  name: string;
  /** Hours logged, one per filled cell. */
  count: number;
  hex: string;
}

export interface DaySummary {
  dateKey: string;
  totalHours: number;
  /** Busiest first — the order a reader wants, and what `DayPopover` renders. */
  activities: DayActivity[];
}

/** What a filled hour holds, once its colour is resolved. */
export interface DayCell {
  activity: string;
  hex: string;
}

export function summarizeDay(
  dateKey: string,
  cellFor: (hourKey: string) => DayCell | null | undefined,
): DaySummary {
  const byActivity = new Map<string, DayActivity>();

  for (let hour = 0; hour < 24; hour += 1) {
    const cell = cellFor(hourCellKey(dateKey, hour));
    if (!cell) continue;
    const entry = byActivity.get(cell.activity);
    if (entry) entry.count += 1;
    else byActivity.set(cell.activity, { name: cell.activity, count: 1, hex: cell.hex });
  }

  const activities = [...byActivity.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    dateKey,
    totalHours: activities.reduce((total, activity) => total + activity.count, 0),
    activities,
  };
}

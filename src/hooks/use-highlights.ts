"use client";

import { useMemo } from "react";

import { useEntityTags } from "@/hooks/use-entity-tags";
import { useSystemPageBlocks, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import {
  groupByYear,
  groupHighlightsForDays,
  HIGHLIGHT_STORED_KIND,
  highlightDayKey,
  HIGHLIGHT_BLOCK_TYPE,
  HIGHLIGHTS_KEY,
  parseHighlightContent,
  type Highlight,
  type HighlightYear,
} from "@/lib/highlights/highlights";

/** Stable parse so the shared list hook's memoized mapping doesn't churn. */
function toHighlight(row: SystemPageBlockRow): Omit<Highlight, "tagIds"> {
  return { ...parseHighlightContent(row.content), id: row.id, sortRank: row.sort_rank ?? "" };
}

/**
 * Every highlight, live, with its tags.
 *
 * One cached query for the whole registry: the collection is a few hundred rows
 * at the very most, so the by-year and by-day views derive from this rather than
 * each running its own (unindexable) JSON predicate against `blocks`. Tags come
 * from one more batched query over the same ids — `entity_tags` is where a
 * waypoint's membership, and so its colour, lives.
 */
export function useHighlights(): { events: Highlight[]; isLoading: boolean } {
  const { items, isLoading } = useSystemPageBlocks(HIGHLIGHT_STORED_KIND, HIGHLIGHTS_KEY, HIGHLIGHT_BLOCK_TYPE, toHighlight);
  const tagIds = useMemo(() => items.map((event) => event.id), [items]);
  const tagsByEvent = useEntityTags(tagIds);

  const events = useMemo(
    () => items.map((event) => ({ ...event, tagIds: tagsByEvent.get(event.id) ?? [] })),
    [items, tagsByEvent],
  );

  return { events, isLoading };
}

/** Events grouped by year — newest year first, oldest day first inside a year. */
export function useHighlightsByYear(): { years: HighlightYear[]; isLoading: boolean } {
  const { events, isLoading } = useHighlights();
  const years = useMemo(() => groupByYear(events), [events]);
  return { years, isLoading };
}

/**
 * One year's events, and the same events grouped by day — the shape the tracker's
 * year grids use: a `Map.get` per day cell rather than a scan, and `events` for
 * the count and for resolving a pin back to the event behind it.
 */
export function useHighlightDays(year: number): {
  events: Highlight[];
  byDay: Map<string, Highlight[]>;
} {
  const { events } = useHighlights();
  return useMemo(() => {
    const inYear = events.filter((event) => event.at.startsWith(`${year}-`));
    const byDay = new Map<string, Highlight[]>();
    for (const event of inYear) {
      const bucket = byDay.get(event.at);
      if (bucket) bucket.push(event);
      else byDay.set(event.at, [event]);
    }
    return { events: inYear, byDay };
  }, [events, year]);
}

/**
 * The events on each of the given days, keyed by `yyyy-MM-dd` — for a strip or a
 * diary that renders a fixed set of days (the journals, the dashboard's date
 * strip) rather than a year. One pass over the registry; days with nothing are
 * simply absent from the map.
 */
export function useHighlightsForDays(dayKeys: readonly string[]): Map<string, Highlight[]> {
  const { events } = useHighlights();
  // Joined so a fresh array with the same days doesn't recompute the grouping.
  const key = dayKeys.join("|");
  return useMemo(() => groupHighlightsForDays(events, key ? key.split("|") : []), [events, key]);
}

/** A single day's events, oldest first. */
export function useDayHighlights(dateKey: string): Highlight[] {
  const { events } = useHighlights();
  return useMemo(
    () =>
      events
        .filter((event) => highlightDayKey(event.at) === dateKey)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [events, dateKey],
  );
}

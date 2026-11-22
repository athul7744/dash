"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { addDays, format, isAfter, isSameDay, isSameMonth, startOfDay } from "date-fns";
import { NotebookPen } from "lucide-react";

import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { useMajorEventsForDays } from "@/hooks/use-major-events";
import { summarizeDayEvents } from "@/lib/major-events/major-events";
import { useAllTags } from "@/hooks/use-tags";
import { tagColors } from "@/lib/tasks/colors";
import { WidgetHeader } from "@/components/tracker/widgets/shared";
import { journalDayKey, useJournalEntryDays } from "@/hooks/use-journal";
import { cn } from "@/lib/shared/utils";

/**
 * The tracker's week journal: the days that have already happened, each a fixed
 * serif heading threaded on a timeline with its own inline editor. Future days
 * are hidden (nothing to reflect on yet), and an entirely-future week renders
 * nothing. Every day is its own lazily-created page (see {@link DailyJournalEntry}).
 *
 * A day that is a major event says so under its date, in the event's tag colours
 * (the same squircle the year views draw), so the week reads at a glance.
 */
export function WeekJournalDiary({ weekStart }: { weekStart: Date }) {
  const [today] = useState(() => new Date());
  const todayStart = useMemo(() => startOfDay(today), [today]);

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return all.filter((d) => !isAfter(startOfDay(d), todayStart)); // only days that have happened
  }, [weekStart, todayStart]);

  const entryDays = useJournalEntryDays(days);
  // The week's waypoints, in the same mark the year views use.
  const dayKeys = useMemo(() => days.map((d) => journalDayKey(d)), [days]);
  const eventsByDay = useMajorEventsForDays(dayKeys);
  const { tags: allTags } = useAllTags();

  if (days.length === 0) return null; // an entirely-future week — nothing to journal yet

  const last = days[days.length - 1];
  const rangeLabel = `${format(weekStart, "MMM d")} – ${format(last, isSameMonth(weekStart, last) ? "d" : "MMM d")}`;

  return (
    <div className="journal-surface mx-auto w-full max-w-2xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-4 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth">
      <WidgetHeader icon={NotebookPen} title="Journal" subtitle={rangeLabel} className="mb-3" />

      <div className="relative">
        {/* Diary spine threading the days. */}
        <div className="pointer-events-none absolute bottom-3 left-[2.75rem] top-3 w-px bg-border/60" aria-hidden />
        {days.map((d, i) => {
          const key = journalDayKey(d);
          const has = entryDays.has(key);
          const dayIsToday = isSameDay(d, today);
          const dayEvents = eventsByDay.get(key);
          const colors = dayEvents ? tagColors(summarizeDayEvents(dayEvents).tagIds, allTags) : [];
          return (
            <div
              key={key}
              className={cn("relative grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-5 py-3", i > 0 && "border-t border-border/40")}
            >
              {/* The date is the way into that whole day, not just its entry. */}
              <Link
                href={`/day/${key}`}
                title={[
                  `Open ${format(d, "d MMMM yyyy")}`,
                  ...(dayEvents ?? []).map((event) => `Major event: ${event.title}`),
                ].join(" · ")}
                className="flex flex-col items-start rounded-lg transition-opacity hover:opacity-70"
              >
                <div className={cn("text-[0.6rem] font-bold uppercase tracking-wide", dayIsToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {format(d, "EEE")}
                </div>
                <div className={cn("mt-0.5 font-serif text-xl leading-none", dayIsToday ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                  {format(d, "d")}
                </div>
                {colors.length > 0 ? <TagColorMark colors={colors} size={10} className="mt-1.5" /> : null}
              </Link>
              {/* Timeline node, centered on the spine. */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-[2.75rem] top-[0.45rem] h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-[var(--color-card)]",
                  has ? "bg-amber-500 dark:bg-amber-400" : "bg-muted-foreground/35",
                )}
              />
              <DailyJournalEntry date={d} hasEntry={has} placeholder={dayIsToday ? "How did today go?" : "Write about this day…"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

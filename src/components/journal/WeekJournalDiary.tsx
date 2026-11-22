"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, isAfter, isSameDay, isSameMonth, startOfDay } from "date-fns";
import { NotebookPen } from "lucide-react";

import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { useHighlightsForDays } from "@/hooks/use-highlights";
import { summarizeDayHighlights } from "@/lib/highlights/highlights";
import { useAllTags } from "@/hooks/use-tags";
import { tagColors } from "@/lib/tasks/colors";
import { WidgetHeader } from "@/components/tracker/widgets/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { useJournalEntryDays, journalDayKey } from "@/hooks/use-journal";
import { useLinkedTargets } from "@/hooks/use-links";
import { systemPageId } from "@/lib/notes/system-pages";
import { cn } from "@/lib/shared/utils";

/**
 * The tracker's week journal: the days that have already happened, each a fixed
 * serif heading threaded on a timeline with its own inline editor. Future days
 * are hidden (nothing to reflect on yet), and an entirely-future week renders
 * nothing. Every day is its own lazily-created page (see {@link DailyJournalEntry}).
 *
 * A day that is a highlight says so under its date, in the event's tag colours
 * (the same squircle the year views draw), so the week reads at a glance.
 */
export function WeekJournalDiary({ weekStart }: { weekStart: Date }) {
  const [today] = useState(() => new Date());
  const todayStart = useMemo(() => startOfDay(today), [today]);

  const days = useMemo(() => {
    const all = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    return all.filter((d) => !isAfter(startOfDay(d), todayStart)); // only days that have happened
  }, [weekStart, todayStart]);

  // Nothing below the fold is built until it is nearly on screen: on a phone the
  // diary sits under the grid and four widgets, and each entry with text mounts a
  // whole editor. `rootMargin` keeps it warm enough that scrolling never waits.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [nearby, setNearby] = useState(false);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || nearby) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearby(true);
          observer.disconnect();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [nearby]);

  const activeDays = nearby ? days : [];
  const entryDays = useJournalEntryDays(activeDays);
  const userId = useCurrentUserId();
  const pageIds = useMemo(
    () => (userId ? days.map((d) => systemPageId(userId, "journal", journalDayKey(d))) : []),
    [userId, days],
  );
  const linkedDays = useLinkedTargets(pageIds);
  // The week's waypoints, in the same mark the year views use.
  const dayKeys = useMemo(() => days.map((d) => journalDayKey(d)), [days]);
  const eventsByDay = useHighlightsForDays(dayKeys);
  const { tags: allTags } = useAllTags();

  if (days.length === 0) return null; // an entirely-future week — nothing to journal yet

  const last = days[days.length - 1];
  const rangeLabel = `${format(weekStart, "MMM d")} – ${format(last, isSameMonth(weekStart, last) ? "d" : "MMM d")}`;

  return (
    <div
      ref={cardRef}
      className="journal-surface mx-auto w-full max-w-2xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-4 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth"
    >
      <WidgetHeader icon={NotebookPen} title="Journal" subtitle={rangeLabel} className="mb-3" />

      {!nearby ? (
        // Sized to the space the real rows take, so scrolling in doesn't shift the
        // page when the diary replaces this.
        <div className="space-y-3" aria-hidden>
          {days.map((d, i) => (
            <div key={journalDayKey(d)} className={cn("grid grid-cols-[2rem_minmax(0,1fr)] gap-5 py-3", i > 0 && "border-t border-border/40")}>
              <div className="text-right font-serif text-xl text-muted-foreground/40">{format(d, "d")}</div>
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          ))}
        </div>
      ) : (
      <div className="relative">
        {/* Diary spine threading the days. */}
        <div className="pointer-events-none absolute bottom-3 left-[2.75rem] top-3 w-px bg-border/60" aria-hidden />
        {days.map((d, i) => {
          const key = journalDayKey(d);
          const has = entryDays.has(key);
          const dayIsToday = isSameDay(d, today);
          const dayEvents = eventsByDay.get(key);
          const colors = dayEvents ? tagColors(summarizeDayHighlights(dayEvents).tagIds, allTags) : [];
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
                  ...(dayEvents ?? []).map((event) => `Highlight: ${event.title}`),
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
              <DailyJournalEntry
                date={d}
                hasEntry={has}
                isLinked={linkedDays.has(systemPageId(userId ?? "", "journal", key))}
                placeholder={dayIsToday ? "How did today go?" : "Write about this day…"}
              />
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

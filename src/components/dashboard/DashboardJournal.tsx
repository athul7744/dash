"use client";

import { useMemo, useState } from "react";
import { addDays, format, isAfter, isSameDay, startOfDay, startOfWeek } from "date-fns";

import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { useHighlightsForDays } from "@/hooks/use-highlights";
import { useAllTags } from "@/hooks/use-tags";
import { summarizeDayHighlights } from "@/lib/highlights/highlights";
import { tagColors } from "@/lib/tasks/colors";
import { journalDayKey, useJournalEntryDays } from "@/hooks/use-journal";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { useLinkedTargets } from "@/hooks/use-links";
import { systemPageId } from "@/lib/notes/system-pages";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

// The journal is a notes system page, so it wears the notes (amber) accent.
const JOURNAL_ACCENT = getApp("notes").accent.iconText;
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * This week's journal in the dashboard's type-led ledger: a Mon–Sun strip that
 * marks which days have an entry and where today is, plus the selected day's
 * inline editor (defaults to today). One page per day (see {@link DailyJournalEntry}).
 * A day that is a highlight carries its tag-coloured squircle under the date.
 */
export function DashboardJournal() {
  const [today] = useState(() => new Date());
  const todayStart = useMemo(() => startOfDay(today), [today]);
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const entryDays = useJournalEntryDays(days);
  const userId = useCurrentUserId();
  // One query for the week's linked days, rather than one per entry.
  const linkedDays = useLinkedTargets(
    useMemo(() => (userId ? days.map((d) => systemPageId(userId, "journal", journalDayKey(d))) : []), [userId, days]),
  );
  const eventsByDay = useHighlightsForDays(useMemo(() => days.map((d) => journalDayKey(d)), [days]));
  const { tags: allTags } = useAllTags();
  const [selected, setSelected] = useState<Date>(() => today);

  const selKey = journalDayKey(selected);
  const selectedIsToday = isSameDay(selected, today);

  return (
    <section id="journal" className="scroll-mt-20">
      <div className={cn("mb-2.5 font-heading text-[0.7rem] font-semibold uppercase tracking-[0.16em]", JOURNAL_ACCENT)}>
        Journal
      </div>

      <div className="mb-4 flex gap-1">
        {days.map((d, i) => {
          const key = journalDayKey(d);
          const sel = key === selKey;
          const has = entryDays.has(key);
          const dayIsToday = isSameDay(d, today);
          const isFuture = isAfter(startOfDay(d), todayStart);
          const dayEvents = eventsByDay.get(key);
          const colors = dayEvents ? tagColors(summarizeDayHighlights(dayEvents).tagIds, allTags) : [];
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => setSelected(d)}
              aria-label={[
                format(d, "EEEE, MMMM d"),
                ...(dayEvents ?? []).map((event) => `highlight: ${event.title}`),
              ].join(", ")}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg border border-transparent py-1.5 transition-colors",
                isFuture ? "cursor-default opacity-35" : sel ? "bg-amber-500/10 dark:bg-amber-400/10" : "hover:bg-accent",
                dayIsToday && !sel && "border-amber-500/40 dark:border-amber-400/40",
              )}
            >
              <span className={cn("text-[0.6rem] font-bold uppercase", dayIsToday ? "text-amber-800 dark:text-amber-400" : "text-muted-foreground")}>
                {DOW[i]}
              </span>
              <span className={cn("font-serif text-base leading-none", sel ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
                {format(d, "d")}
              </span>
              <span className="flex h-[0.625rem] items-center gap-1">
                <span className={cn("h-1 w-1 rounded-full transition-colors", has ? "bg-amber-500 dark:bg-amber-400" : "bg-transparent")} />
                {colors.length > 0 ? <TagColorMark colors={colors} size={9} /> : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-heading text-base font-semibold text-foreground">{format(selected, "EEEE, MMMM d")}</span>
        {selectedIsToday ? (
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-400">Today</span>
        ) : null}
      </div>

      <DailyJournalEntry
        key={selKey}
        date={selected}
        hasEntry={entryDays.has(selKey)}
        isLinked={!!userId && linkedDays.has(systemPageId(userId, "journal", selKey))}
        placeholder={selectedIsToday ? "How did today go?" : "Write about this day…"}
      />
    </section>
  );
}

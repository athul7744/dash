"use client";

import { useMemo, useState } from "react";
import { addDays, format, isSameDay, isSameMonth } from "date-fns";

import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { journalDayKey, useJournalEntryDays } from "@/hooks/use-journal";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

const JOURNAL_ACCENT = getApp("notes").accent.iconText;

/**
 * The tracker's week journal: the whole week as one diary — a fixed serif
 * heading per day threaded on a timeline, each with its own inline editor.
 * Every day is its own lazily-created page (see {@link DailyJournalEntry}).
 */
export function WeekJournalDiary({ weekStart }: { weekStart: Date }) {
  const [today] = useState(() => new Date());
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const entryDays = useJournalEntryDays(days);

  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, isSameMonth(weekStart, weekEnd) ? "d" : "MMM d")}`;

  return (
    <div className="journal-surface mx-auto w-full max-w-3xl rounded-2xl border border-border/65 bg-gradient-to-b from-card/70 to-card/40 p-5 shadow-[0_12px_38px_-28px_rgba(0,0,0,0.45)] transition-smooth sm:p-7">
      <div className="mb-3 flex items-baseline justify-between border-b border-border/60 pb-3">
        <span className={cn("font-heading text-[0.7rem] font-semibold uppercase tracking-[0.16em]", JOURNAL_ACCENT)}>
          Journal
        </span>
        <span className="font-serif text-sm text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="relative">
        {/* Diary spine threading the days. */}
        <div className="pointer-events-none absolute bottom-3 left-[3.4rem] top-3 w-px bg-border/60" aria-hidden />
        {days.map((d, i) => {
          const key = journalDayKey(d);
          const has = entryDays.has(key);
          const dayIsToday = isSameDay(d, today);
          return (
            <div
              key={key}
              className={cn("relative grid grid-cols-[3.4rem_minmax(0,1fr)] items-start gap-4 py-3", i > 0 && "border-t border-border/40")}
            >
              <div className="text-right">
                <div className={cn("text-[0.6rem] font-bold uppercase tracking-wide", dayIsToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                  {format(d, "EEE")}
                </div>
                <div className={cn("mt-0.5 font-serif text-xl leading-none", dayIsToday ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                  {format(d, "d")}
                </div>
              </div>
              {/* Timeline node. */}
              <span
                aria-hidden
                className={cn(
                  "absolute left-[3.4rem] top-[0.4rem] h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-[var(--color-card)]",
                  has ? "bg-amber-500 dark:bg-amber-400" : "bg-muted-foreground/35",
                )}
              />
              <DailyJournalEntry date={d} placeholder={dayIsToday ? "How did today go?" : "Write about this day…"} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

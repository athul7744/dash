"use client";

import { useMemo, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";

import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { journalDayKey, useJournalEntryDays } from "@/hooks/use-journal";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

// The journal is a notes system page, so it wears the notes (amber) accent.
const JOURNAL_ACCENT = getApp("notes").accent.iconText;
const DOW = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * This week's journal in the dashboard's type-led ledger: a Mon–Sun strip that
 * marks which days have an entry and where today is, plus the selected day's
 * inline editor (defaults to today). One page per day (see {@link DailyJournalEntry}).
 */
export function DashboardJournal() {
  const [today] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(today, { weekStartsOn: 1 }), [today]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const entryDays = useJournalEntryDays(days);
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
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(d)}
              aria-label={format(d, "EEEE, MMMM d")}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-lg border border-transparent py-1.5 transition-colors",
                sel ? "bg-amber-500/10 dark:bg-amber-400/10" : "hover:bg-accent",
                dayIsToday && !sel && "border-amber-500/40 dark:border-amber-400/40",
              )}
            >
              <span className={cn("text-[0.6rem] font-bold uppercase", dayIsToday ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                {DOW[i]}
              </span>
              <span className={cn("font-serif text-base leading-none", sel ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
                {format(d, "d")}
              </span>
              <span className={cn("h-1 w-1 rounded-full transition-colors", has ? "bg-amber-500 dark:bg-amber-400" : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <div className="mb-2 font-serif text-lg text-foreground">
        {format(selected, "EEEE, MMMM d")}
        {selectedIsToday ? <span className="ml-1.5 text-sm italic text-amber-600 dark:text-amber-400">Today</span> : null}
      </div>

      <DailyJournalEntry
        key={selKey}
        date={selected}
        placeholder={selectedIsToday ? "How did today go?" : "Write about this day…"}
      />
    </section>
  );
}

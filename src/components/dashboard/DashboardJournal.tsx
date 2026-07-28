"use client";

import { startOfWeek } from "date-fns";

import { WeeklyJournal } from "@/components/tracker/WeeklyJournal";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

// The journal is a notes system page, so it wears the notes (amber) accent to
// match the type-led ledger's labels.
const JOURNAL_ACCENT = getApp("notes").accent.iconText;

/**
 * This week's journal, editable inline in the dashboard's type-led ledger.
 * Reuses the tracker's WeeklyJournal (same week key → same underlying system
 * page) in its `bare` form — no card, no internal header — under a matching
 * accent label.
 */
export function DashboardJournal() {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  return (
    <section id="weekly-journal" className="scroll-mt-20">
      <div className={cn("mb-2.5 font-heading text-[0.7rem] font-semibold uppercase tracking-[0.16em]", JOURNAL_ACCENT)}>
        This week&apos;s journal
      </div>
      <WeeklyJournal weekStart={weekStart} bare />
    </section>
  );
}

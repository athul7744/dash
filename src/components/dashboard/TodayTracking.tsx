"use client";

import Link from "next/link";
import { useQuery } from "@powersync/react";
import { ArrowRight } from "lucide-react";

import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { utcDateKey, utcDayBounds } from "@/lib/tracker/day-keys";

const TRACKER_APP = getApp("tracker");

export function TodayTracking() {
  const [rangeStart, rangeEnd] = utcDayBounds(utcDateKey(new Date()));

  // Hours logged today — UTC-naive window (see day-keys).
  const { data: logRows = [] } = useQuery<{ mins: number | null }>(
    `SELECT SUM(duration_minutes) AS mins FROM time_logs
     WHERE start_timestamp >= ? AND start_timestamp <= ?`,
    [rangeStart, rangeEnd],
  );
  const minutes = logRows[0]?.mins ?? 0;
  const hours = minutes / 60;

  return (
    <section>
      <div className={cn("mb-3 font-heading text-[0.7rem] font-semibold uppercase tracking-[0.16em]", TRACKER_APP.accent.iconText)}>
        Tracked today
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums text-foreground">{hours.toFixed(1)}</span>
        <span className="text-sm text-muted-foreground">hours logged</span>
      </div>
      {minutes === 0 ? (
        <p className="mt-1 font-serif text-sm text-muted-foreground">You haven&apos;t logged today.</p>
      ) : null}

      <Link href="/tracker/week" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
        Open tracker
        <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}

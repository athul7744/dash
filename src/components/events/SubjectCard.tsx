"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { History } from "lucide-react";

import { EventLogNow } from "@/components/events/EventLogNow";
import { type ThingAggregate } from "@/hooks/use-events";
import { statsFromAggregate, formatDays } from "@/lib/events/events";
import { getApp } from "@/lib/shared/apps";
import { refKindAccentVar, type RefKind } from "@/lib/links/tokens";
import { formatRelativeTime } from "@/lib/shared/utils";

/**
 * A compact, read-only card for a non-event subject (a note/bookmark/task/quote
 * you've logged occurrences against). Mirrors `EventCard` minus the schedule —
 * kind icon + label, last-done / cadence / overdue, count, and a Log button. The
 * whole card opens the shared detail route (`/events/[id]`), which renders the
 * subject view. Stats come from the page-level aggregate.
 */
export function SubjectCard({
  subjectId,
  subjectKind,
  label,
  aggregate,
  placeSuggestions = [],
}: {
  subjectId: string;
  subjectKind: RefKind;
  label: string;
  aggregate?: ThingAggregate;
  placeSuggestions?: string[];
}) {
  const stats = statsFromAggregate(aggregate, null);
  const lastAtDate = stats.lastAt ? new Date(stats.lastAt) : null;
  const cadenceLabel = stats.expectedGapDays != null ? `every ~${formatDays(stats.expectedGapDays)}` : null;
  const Icon = getApp(`${subjectKind}s`).icon;
  const kindLabel = subjectKind.charAt(0).toUpperCase() + subjectKind.slice(1);

  return (
    <div className="group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors hover:border-border sm:p-6">
      <Link
        href={`/events/${subjectId}`}
        aria-label={`Open ${label || "subject"}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50"
            style={{ color: refKindAccentVar(subjectKind) } as CSSProperties}
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="text-xs font-semibold text-muted-foreground/70">{kindLabel}</span>
        </div>

        <h3 className="truncate text-[15px] font-semibold text-card-foreground">{label || "Untitled"}</h3>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {lastAtDate ? (
              <>
                Last <span className="font-medium text-foreground">{formatRelativeTime(lastAtDate)}</span>
              </>
            ) : (
              "Never logged"
            )}
          </span>
          {cadenceLabel ? <span className="text-muted-foreground/70">· {cadenceLabel}</span> : null}
          {stats.overdue ? (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600 dark:text-red-400">Overdue</span>
          ) : null}
          <span className="pointer-events-auto">
            <EventLogNow subjectId={subjectId} subjectKind={subjectKind} placeSuggestions={placeSuggestions} />
          </span>
        </div>

        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground/70">
          <History className="h-3.5 w-3.5" />
          {stats.count} occurrence{stats.count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

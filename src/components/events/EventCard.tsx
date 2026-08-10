"use client";

import Link from "next/link";
import { CalendarClock, Ellipsis, History, ListPlus, Pause, Play, Tag as TagIcon, Trash2 } from "lucide-react";

import { EventLogNow } from "@/components/events/EventLogNow";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { TagSelector } from "@/components/tags/TagSelector";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { type ThingAggregate } from "@/hooks/use-events";
import { useOptimisticTagIds } from "@/hooks/use-entity-tags";
import { generateTaskForEvent } from "@/lib/events/materialize";
import { statsFromAggregate, toggleActive, updateEvent, type EventItem } from "@/lib/events/events";
import { useTrashAction } from "@/hooks/use-trash-action";
import { describeSchedule, nextScheduledOccurrence } from "@/lib/events/schedule";
import { stripRefs } from "@/lib/links/tokens";
import { cn, formatRelativeTime } from "@/lib/shared/utils";

const HEADER_BTN = "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

/**
 * A compact, read-only summary of one recurring "thing": a top header (icon +
 * pause/tags/⋯ actions), then what it is, when it last happened, what its
 * schedule does, its tags, and its occurrence count. The whole card links to the
 * full editor (`/events/[id]`); the header actions + "Log now" opt back into
 * pointer events so they don't trigger navigation. Stats come from the page-level
 * aggregate (`aggregate` prop), so there's no per-card scan.
 */
export function EventCard({
  event,
  aggregate,
  placeSuggestions = [],
  tagIds = [],
}: {
  event: EventItem;
  aggregate?: ThingAggregate;
  placeSuggestions?: string[];
  /** Tag ids from entity_tags (batched by the list); membership's source of truth. */
  tagIds?: string[];
}) {
  // Seeded from entity_tags via a stable joined key; setter drives optimistic edits.
  const [selectedTagIds, setSelectedTagIds] = useOptimisticTagIds(tagIds);
  const trash = useTrashAction();
  const s = event.schedule;
  const today = new Date();
  const cadenceDays = s?.freq === "interval" ? s.days : null;
  const stats = statsFromAggregate(aggregate, cadenceDays, today);
  const lastAtDate = stats.lastAt ? new Date(stats.lastAt) : null;
  const next = s ? nextScheduledOccurrence(s, today, event.lastMaterializedKey, lastAtDate) : null;
  const titleText = stripRefs(event.title) || "Untitled event";

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors hover:border-border sm:p-6",
        !event.active && "opacity-70",
      )}
    >
      {/* Full-card link sits beneath the content; interactive controls opt back
          into pointer events so they don't trigger navigation. */}
      <Link
        href={`/events/${event.id}`}
        aria-label={`Open ${titleText}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10">
        {/* Top header: identity icon (left) + actions (right). */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-violet-600 dark:text-violet-400">
            <CalendarClock className="h-4.5 w-4.5" />
          </span>

          <div className="pointer-events-auto flex items-center gap-0.5">
            {s ? (
              <button
                type="button"
                aria-label={event.active ? "Pause scheduling" : "Resume scheduling"}
                title={event.active ? "Pause scheduling" : "Resume scheduling"}
                onClick={() => void toggleActive(event.id)}
                className={HEADER_BTN}
              >
                {event.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            ) : null}
            <TagSelector
              selectedTagIds={selectedTagIds}
              onSelectedTagIdsChange={(ids) => {
                setSelectedTagIds(ids);
                void updateEvent(event.id, { tags: ids });
              }}
              showSelectedTags={false}
              triggerContent={<TagIcon className="h-4 w-4" />}
              triggerClassName={HEADER_BTN}
            />
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="More actions" className={cn(HEADER_BTN, "focus:outline-none")}>
                <Ellipsis className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => void generateTaskForEvent(event.id)}>
                  <ListPlus className="h-4 w-4" />
                  Generate task
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => trash("event", event.id, titleText)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <h3 className={cn("text-[15px] font-semibold text-card-foreground", !event.active && "line-through")}>{titleText}</h3>

        {/* Recall: last-done + overdue, and one-tap log. */}
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
          {stats.overdue ? (
            <span className="rounded-full bg-red-500/10 px-2 py-0.5 font-semibold text-red-600 dark:text-red-400">Overdue</span>
          ) : null}
          <span className="pointer-events-auto">
            <EventLogNow subjectId={event.id} subjectKind="event" defaultPlace={event.defaultPlace} placeSuggestions={placeSuggestions} inCard />
          </span>
        </div>

        {/* What the schedule does, in plain English (same as the detail strip). */}
        <p className="mt-2.5 flex items-start gap-1.5 text-xs text-muted-foreground/80">
          <CalendarClock className="mt-px h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-400" />
          <span>{describeSchedule({ schedule: s, daysBefore: event.daysBefore, active: event.active }, next)}</span>
        </p>

        <SelectedTagPills tagIds={selectedTagIds} className="mt-3" />

        <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground/70">
          <History className="h-3.5 w-3.5" />
          {stats.count} occurrence{stats.count === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}

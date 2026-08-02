"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, CalendarClock, Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { EventDetailLoadingSkeleton } from "@/components/skeletons/EventDetailLoadingSkeleton";
import { EventHeatmap } from "@/components/events/EventHeatmap";
import { EventLogNow } from "@/components/events/EventLogNow";
import { EventScheduleDialog } from "@/components/events/EventScheduleDialog";
import { OccurrenceLog } from "@/components/events/OccurrenceLog";
import { LinkedFrom } from "@/components/links/LinkedFrom";
import { RefField } from "@/components/links/RefField";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { TagSelector } from "@/components/tags/TagSelector";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { useDerivedState } from "@/hooks/use-derived-state";
import { useEntityTags } from "@/hooks/use-entity-tags";
import { useEvent, useEventMaterializer, useOccurrences, useSubjectLabels, useThingAggregates } from "@/hooks/use-events";
import { statsFromAggregate, deleteEvent, formatDays, updateEvent, type EventItem } from "@/lib/events/events";
import { describeSchedule, nextOccurrenceOnOrAfter } from "@/lib/events/schedule";
import { reconcileEntityRefs } from "@/lib/links/links";
import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { getApp } from "@/lib/shared/apps";
import { refKindAccentVar } from "@/lib/links/tokens";
import { cn, formatRelativeTime } from "@/lib/shared/utils";

const eventsApp = getApp("events");

export default function EventDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { event, isLoading } = useEvent(id);
  useEventMaterializer();

  if (isLoading) return <EventDetailLoadingSkeleton />;
  if (event) return <EventDetail event={event} />;
  // Not an event block → it's another entity logged against (note/bookmark/…).
  return <SubjectDetail subjectId={id ?? ""} />;
}

function EventDetail({ event }: { event: EventItem }) {
  const router = useRouter();
  // The event may track an external subject — its log lives on that entity.
  const subjectId = event.subjectId ?? event.id;
  const subjectKind = event.subjectKind ?? "event";
  const aggregates = useThingAggregates();
  const { occurrences } = useOccurrences({ thingId: subjectId, limit: 400 });
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [title, setTitle] = useState(event.title);
  const { focusedRef, schedule, flush } = useDebouncedSave();
  // Tags live in entity_tags; seed local optimistic state from the batched lookup.
  const entityTags = useEntityTags(useMemo(() => [event.id], [event.id]));
  const [selectedTagIds, setSelectedTagIds] = useDerivedState((entityTags.get(event.id) ?? []).join(","), (k) => (k ? k.split(",") : []));

  const placeSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const o of occurrences) if (o.place) set.add(o.place);
    if (event.defaultPlace) set.add(event.defaultPlace);
    return [...set].sort();
  }, [occurrences, event.defaultPlace]);

  const now = new Date();
  const s = event.schedule;
  const cadenceDays = s?.freq === "interval" ? s.days : null;
  const agg = aggregates.get(subjectId);
  const stats = statsFromAggregate(agg, cadenceDays, now);
  const lastAtDate = stats.lastAt ? new Date(stats.lastAt) : null;
  const next = s ? nextOccurrenceOnOrAfter(s, now, lastAtDate) : null;

  const commitTitle = () =>
    flush(() => {
      void updateEvent(event.id, { title });
      void reconcileEntityRefs(event.id, [title]);
    });

  const removeEvent = () => {
    void deleteEvent(event.id);
    router.push("/events");
  };

  return (
    <>
      <AppHeader
        app={eventsApp}
        actions={
          <button
            type="button"
            onClick={removeEvent}
            aria-label="Delete event"
            title="Delete event"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        }
        mobileMenuItems={
          <button type="button" onClick={removeEvent} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete event
          </button>
        }
      />

      <div className="skeleton-settle-in mx-auto max-w-2xl px-[var(--app-gutter-x)] py-8 pb-40 lg:max-w-7xl">
        <Link
          href="/events"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All events
        </Link>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-8">
          {/* ── LEFT: overview ── */}
          <div className="min-w-0">
            {/* ── hero ── */}
            <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-semibold text-muted-foreground">
              Event · {s ? "Scheduled" : "Log only"}
            </div>
            <RefField
              value={title}
              singleLine
              excludeId={event.id}
              ariaLabel="Event title"
              placeholder="What happens…"
              onFocus={() => {
                focusedRef.current = true;
              }}
              onChange={(v) => {
                setTitle(v);
                schedule(() => {
                  void updateEvent(event.id, { title: v });
                  void reconcileEntityRefs(event.id, [v]);
                });
              }}
              onCommit={commitTitle}
              onBlur={commitTitle}
              className={cn("mt-1.5 w-full bg-transparent font-heading text-2xl font-semibold text-foreground", !event.active && "line-through")}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm">
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
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">Overdue</span>
              ) : null}
              <TagSelector
                selectedTagIds={selectedTagIds}
                onSelectedTagIdsChange={(ids) => {
                  setSelectedTagIds(ids);
                  void updateEvent(event.id, { tags: ids });
                }}
                showSelectedTags={false}
                triggerContent={<TagIcon className="h-3.5 w-3.5" />}
                triggerClassName="grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              />
            </div>
            <SelectedTagPills tagIds={selectedTagIds} className="mt-2.5" />
          </div>
        </div>

        {/* ── schedule strip (compact, read-only) ── */}
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/65 bg-card/50 p-4">
          <CalendarClock className="h-4.5 w-4.5 shrink-0 text-violet-500 dark:text-violet-400" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            {describeSchedule({ schedule: s, daysBefore: event.daysBefore, active: event.active }, next)}
          </p>
          <button
            type="button"
            onClick={() => setScheduleOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
          >
            {s ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {s ? "Edit schedule" : "Add schedule"}
          </button>
        </div>

        {/* ── stats ── */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Last done" value={lastAtDate ? formatRelativeTime(lastAtDate) : "Never"} warn={stats.overdue} />
          <Stat label="Cadence" value={stats.expectedGapDays != null ? `~${formatDays(stats.expectedGapDays)}` : "—"} />
          {s && next ? <Stat label="Next due" value={format(next, "PP")} /> : null}
          <Stat label="Logged" value={String(stats.count)} sub={stats.count === 1 ? "time" : "times"} />
        </div>

        {/* ── heatmap ── */}
        <div className="mt-6 rounded-xl border border-border/65 bg-card/50 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-[11px] font-semibold text-muted-foreground">A year of this</h2>
            <span className="text-xs text-muted-foreground/60">{stats.count} occurrences</span>
          </div>
          <EventHeatmap dates={occurrences.map((o) => o.at)} />
        </div>

          </div>

          {/* ── RIGHT: the log ── */}
          <div className="mt-8 min-w-0 lg:mt-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold text-muted-foreground">Logs</h2>
              <EventLogNow subjectId={subjectId} subjectKind={subjectKind} defaultPlace={event.defaultPlace} placeSuggestions={placeSuggestions} />
            </div>
            <OccurrenceLog subjectId={subjectId} placeSuggestions={placeSuggestions} />
            <LinkedFrom targetId={event.id} className="mt-6" />
          </div>
        </div>
      </div>

      <EventScheduleDialog event={event} open={scheduleOpen} onOpenChange={setScheduleOpen} />

      <MobileBottomFabs
        app={eventsApp}
        centerContent={<EventLogNow subjectId={subjectId} subjectKind={subjectKind} defaultPlace={event.defaultPlace} placeSuggestions={placeSuggestions} variant="label" />}
      />
    </>
  );
}

/**
 * Detail view when the id is NOT an event block — a note/bookmark/task/quote
 * you've logged against. Brief entity header + the same recall (stats, heatmap,
 * occurrence log) as an event, minus scheduling. Subject kind comes from its
 * occurrences; the title/label is read-only (edited in the entity's own app).
 */
function SubjectDetail({ subjectId }: { subjectId: string }) {
  const router = useRouter();
  const aggregates = useThingAggregates();
  const { occurrences, isLoading } = useOccurrences({ thingId: subjectId, limit: 400 });
  const kind = occurrences[0]?.subjectKind ?? null;

  // A subject only lives in Events through its occurrences. Once the last one is
  // deleted it has no timeline (and no card), so return to the grid rather than
  // showing "not found". Only redirect if it *had* occurrences — never on a
  // brand-new event whose block hasn't synced into `useEvent` yet.
  const [everHadOccurrences, setEverHadOccurrences] = useState(false);
  if (occurrences.length > 0 && !everHadOccurrences) setEverHadOccurrences(true);
  useEffect(() => {
    if (!isLoading && everHadOccurrences && occurrences.length === 0) router.replace("/events");
  }, [isLoading, everHadOccurrences, occurrences.length, router]);
  const subjectList = useMemo(() => (kind ? [{ id: subjectId, kind }] : []), [subjectId, kind]);
  const labels = useSubjectLabels(subjectList);
  const label = labels.get(subjectId) ?? "";

  const placeSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const o of occurrences) if (o.place) set.add(o.place);
    return [...set].sort();
  }, [occurrences]);

  const now = new Date();
  const agg = aggregates.get(subjectId);
  const stats = statsFromAggregate(agg, null, now);
  const lastAtDate = stats.lastAt ? new Date(stats.lastAt) : null;

  if (isLoading) return <EventDetailLoadingSkeleton />;
  // Empty after having had occurrences → redirecting to the grid (show the
  // skeleton meanwhile); empty from the start → a genuinely unknown id.
  if (!kind || occurrences.length === 0) return everHadOccurrences ? <EventDetailLoadingSkeleton /> : <NotFound />;

  const Icon = getApp(`${kind}s`).icon;
  const kindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);

  return (
    <>
      <AppHeader app={eventsApp} />

      <div className="skeleton-settle-in mx-auto max-w-2xl px-[var(--app-gutter-x)] py-8 pb-40 lg:max-w-7xl">
        <Link
          href="/events"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          All events
        </Link>
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start lg:gap-8">
          {/* ── LEFT: overview ── */}
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-heading text-sm font-semibold text-muted-foreground">{kindLabel} · Timeline</div>
                <h1 className="mt-1.5 flex items-center gap-2 font-heading text-2xl font-semibold text-foreground">
                  <Icon className="h-5 w-5 shrink-0" style={{ color: refKindAccentVar(kind) }} />
                  <span className="min-w-0 truncate">{label || "Untitled"}</span>
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm">
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
                    <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">Overdue</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => dispatchOpenEntity(kind, subjectId)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" /> Open {kind}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Last done" value={lastAtDate ? formatRelativeTime(lastAtDate) : "Never"} warn={stats.overdue} />
              <Stat label="Cadence" value={stats.expectedGapDays != null ? `~${formatDays(stats.expectedGapDays)}` : "—"} />
              <Stat label="Logged" value={String(stats.count)} sub={stats.count === 1 ? "time" : "times"} />
            </div>

            <div className="mt-6 rounded-xl border border-border/65 bg-card/50 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-[11px] font-semibold text-muted-foreground">A year of this</h2>
                <span className="text-xs text-muted-foreground/60">{stats.count} occurrences</span>
              </div>
              <EventHeatmap dates={occurrences.map((o) => o.at)} />
            </div>
          </div>

          {/* ── RIGHT: the log ── */}
          <div className="mt-8 min-w-0 lg:mt-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm font-semibold text-muted-foreground">Logs</h2>
              <EventLogNow subjectId={subjectId} subjectKind={kind} placeSuggestions={placeSuggestions} />
            </div>
            <OccurrenceLog subjectId={subjectId} placeSuggestions={placeSuggestions} />
            <LinkedFrom targetId={subjectId} className="mt-6" />
          </div>
        </div>
      </div>

      <MobileBottomFabs
        app={eventsApp}
        centerContent={<EventLogNow subjectId={subjectId} subjectKind={kind} placeSuggestions={placeSuggestions} variant="label" />}
      />
    </>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-border/65 bg-card/50 p-3.5", warn && "border-red-500/40 bg-red-500/5")}>
      <div className="text-[11px] font-semibold text-muted-foreground/70">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tracking-tight", warn ? "text-red-600 dark:text-red-400" : "text-foreground")}>
        {value}
        {sub ? <span className="ml-1 text-xs font-normal text-muted-foreground">{sub}</span> : null}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <>
      <AppHeader app={eventsApp} />
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-[var(--app-gutter-x)] py-24 text-center">
        <p className="font-serif text-lg text-foreground">Event not found</p>
        <p className="max-w-xs text-sm text-muted-foreground">It may have been deleted. Head back to the list.</p>
        <Link href="/events" className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 dark:bg-violet-500">
          <ArrowLeft className="h-4 w-4" />
          All events
        </Link>
      </div>
    </>
  );
}

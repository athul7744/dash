"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { format } from "date-fns";
import { CalendarClock, MapPin, Plus, Search } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { EventCard } from "@/components/events/EventCard";
import { SubjectCard } from "@/components/events/SubjectCard";
import { EventsLoadingSkeleton } from "@/components/skeletons/EventsLoadingSkeleton";
import { useEvents, useEventMaterializer, useOccurrences, useSubjectLabels, useThingAggregates } from "@/hooks/use-events";
import { useNewItemParam } from "@/hooks/use-new-item-param";
import { dispatchOpenEntity } from "@/components/links/EntityRefNode";
import { statsFromAggregate, createEvent } from "@/lib/events/events";
import { getApp, HEADER_ACTION_BASE } from "@/lib/shared/apps";
import { refKindAccentVar, type RefKind } from "@/lib/links/tokens";
import { formatRelativeTime, cn } from "@/lib/shared/utils";

const eventsApp = getApp("events");
type Tab = "all" | "scheduled" | "overdue" | "timeline";
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "overdue", label: "Overdue" },
  { value: "timeline", label: "Timeline" },
];
const HEADING: Record<Exclude<Tab, "timeline">, string> = { all: "All events", scheduled: "Scheduled", overdue: "Overdue" };

export default function EventsPage() {
  const router = useRouter();
  const { events, isLoading } = useEvents();
  const aggregates = useThingAggregates();
  const { occurrences } = useOccurrences({ limit: 500 });
  useEventMaterializer();

  const [tab, setTab] = useState<Tab>("all");
  const [timelineQuery, setTimelineQuery] = useState("");

  // Navigate to the new event first (with a pre-generated id), then write it, so
  // the list never flashes an empty card before the editor opens.
  const addEvent = () => {
    const id = uuidv4();
    router.push(`/events/${id}`);
    void createEvent({ id });
  };
  useNewItemParam(addEvent, !isLoading);

  const placeSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const o of occurrences) if (o.place) set.add(o.place);
    for (const e of events) if (e.defaultPlace) set.add(e.defaultPlace);
    return [...set].sort();
  }, [occurrences, events]);

  const subjects = useMemo(() => occurrences.map((o) => ({ id: o.thingId, kind: o.subjectKind })), [occurrences]);
  const subjectLabels = useSubjectLabels(subjects);

  // Cards = standalone events + every other entity you've logged against
  // (notes/bookmarks/tasks/quotes), overdue-first, plus the tab filter.
  const now = new Date();
  const cards = useMemo(() => {
    // An event's effective subject is itself, or an external entity it tracks
    // (the About… picker). Stats + occurrences live under that id.
    const eventSubjectIds = new Set(events.map((e) => e.subjectId ?? e.id));

    const eventRows = events.map((e) => {
      const agg = aggregates.get(e.subjectId ?? e.id);
      const cadenceDays = e.schedule?.freq === "interval" ? e.schedule.days : null;
      const stats = statsFromAggregate(agg, cadenceDays, now);
      return { type: "event" as const, key: e.id, event: e, agg, scheduled: e.schedule != null, overdue: stats.overdue, lastMs: stats.lastAt ? Date.parse(stats.lastAt) : 0 };
    });

    // Distinct non-event subjects that carry occurrences — excluding any that an
    // event already represents, so a Phase-D "about X" event isn't shown twice.
    const seen = new Map<string, RefKind>();
    for (const o of occurrences) if (o.thingId && !eventSubjectIds.has(o.thingId) && !seen.has(o.thingId)) seen.set(o.thingId, o.subjectKind);
    const subjectRows = [...seen.entries()].map(([id, kind]) => {
      const agg = aggregates.get(id);
      const stats = statsFromAggregate(agg, null, now);
      return { type: "subject" as const, key: id, subjectId: id, subjectKind: kind, label: subjectLabels.get(id) ?? "", agg, scheduled: false, overdue: stats.overdue, lastMs: stats.lastAt ? Date.parse(stats.lastAt) : 0 };
    });

    const all = [...eventRows, ...subjectRows].filter((c) => {
      if (tab === "scheduled") return c.scheduled;
      if (tab === "overdue") return c.overdue;
      return true;
    });
    all.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.lastMs - a.lastMs);
    return all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, aggregates, occurrences, subjectLabels, tab]);

  const timeline = useMemo(() => {
    const q = timelineQuery.trim().toLowerCase();
    const rows = occurrences
      .map((o) => ({ ...o, title: subjectLabels.get(o.thingId) ?? "Untitled" }))
      .filter((o) => (q ? `${o.action} ${o.title} ${o.place} ${o.note}`.toLowerCase().includes(q) : true));
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.at ? format(new Date(r.at), "PP") : "—";
      const arr = groups.get(key) ?? [];
      arr.push(r);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [occurrences, subjectLabels, timelineQuery]);

  if (isLoading) return <EventsLoadingSkeleton />;

  return (
    <>
      <AppHeader
        app={eventsApp}
        actions={
          <button type="button" onClick={addEvent} className={cn(HEADER_ACTION_BASE, eventsApp.accent.hoverText)}>
            <Plus className="h-4 w-4" />
            New event
          </button>
        }
      />

      <div className="mx-auto max-w-7xl px-[var(--app-gutter-x)] py-8 pb-40">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="rounded-2xl bg-violet-500/10 p-3 dark:bg-violet-500/20">
              <CalendarClock className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="font-serif text-lg text-foreground">No events yet</p>
              <p className="max-w-xs text-sm text-muted-foreground">
                Track recurring things — when they happened, how often, and what&apos;s due. Log an occurrence any
                time, and add a schedule when you want a reminder.
              </p>
            </div>
            <button
              type="button"
              onClick={addEvent}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-violet-500"
            >
              <Plus className="h-4 w-4" />
              New event
            </button>
          </div>
        ) : (
          <>
            {/* One segmented control: thing filters + the timeline view. */}
            <div className="mt-2 flex items-center justify-center sm:mt-4">
              <div className="inline-flex gap-1 rounded-full border border-border/60 bg-card/50 p-1">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "rounded-full px-3.5 py-1 text-xs font-medium transition-colors",
                      tab === t.value ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {tab !== "timeline" ? (
              <>
                <CollectionHeading label={HEADING[tab]} count={cards.length} className="mt-6 mb-6" />

                <div className="columns-1 gap-5 md:columns-2 lg:columns-3">
                  {cards.map((c) => (
                    <div key={c.key} className="mb-5 break-inside-avoid">
                      {c.type === "event" ? (
                        <EventCard event={c.event} aggregate={c.agg} placeSuggestions={placeSuggestions} />
                      ) : (
                        <SubjectCard subjectId={c.subjectId} subjectKind={c.subjectKind} label={c.label} aggregate={c.agg} placeSuggestions={placeSuggestions} />
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mx-auto mt-6 max-w-2xl">
                <div className="relative mb-6">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={timelineQuery}
                    onChange={(e) => setTimelineQuery(e.target.value)}
                    placeholder="Filter by name, place, or note…"
                    className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary/60"
                  />
                </div>
                {timeline.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No occurrences.</p>
                ) : (
                  <div className="space-y-6">
                    {timeline.map(([day, rows]) => (
                      <div key={day}>
                        <h3 className="mb-2 text-xs font-semibold text-muted-foreground">{day}</h3>
                        <ul className="space-y-1.5">
                          {rows.map((o) => {
                            const SubjectIcon = getApp(`${o.subjectKind}s`).icon;
                            return (
                            <li key={o.id} className="flex items-center gap-2 text-sm">
                              {o.action ? <span className="shrink-0 font-medium text-foreground">{o.action}</span> : null}
                              <button
                                type="button"
                                onClick={() => dispatchOpenEntity(o.subjectKind, o.thingId)}
                                className="inline-flex min-w-0 max-w-full items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <SubjectIcon className="h-3 w-3 shrink-0" style={{ color: refKindAccentVar(o.subjectKind) }} />
                                <span className="min-w-0 truncate">{o.title}</span>
                              </button>
                              {o.at ? <span className="shrink-0 text-xs text-muted-foreground/70">{formatRelativeTime(new Date(o.at))}</span> : null}
                              {o.place ? (
                                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3" />
                                  {o.place}
                                </span>
                              ) : null}
                              {o.note ? <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">{o.note}</span> : null}
                            </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <MobileBottomFabs
        app={eventsApp}
        centerContent={
          <button type="button" onClick={addEvent} className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Plus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            New event
          </button>
        }
      />
    </>
  );
}

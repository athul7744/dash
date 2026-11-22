"use client";

/**
 * One calendar day, across every app.
 *
 * Tracker is the only app with no per-entity anchor — its rows are keyed by date
 * rather than by an id — so the day itself is the join. This page is the reader:
 * what you wrote, what you tracked, what you meant to do, what you logged and
 * what you saved, for a single `yyyy-MM-dd`. Writing leads, because it is the
 * one thing here you come to *do* rather than to read.
 *
 * Sections stay separate on purpose. Tracker's timestamps are UTC-naive while
 * everything else is a real instant, so interleaving them into one chronological
 * feed would order them wrongly by the viewer's UTC offset (see `day-keys.ts`).
 */

import { useMemo, useState, ViewTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { addDays, format, isValid, parseISO } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, Flag, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { ENTITY_ROW_CLASS, EntityRow } from "@/components/links/EntityRow";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActivityToolbar } from "@/components/tracker/ActivityToolbar";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { HighlightDialog } from "@/components/day/HighlightDialog";
import { TimeGrid } from "@/components/tracker/TimeGrid";
import { MoodPicker } from "@/components/dashboard/MoodPicker";
import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { useDayCaptures, useDayOccurrences, useDayTasks } from "@/hooks/use-day";
import { useSubjectLabels } from "@/hooks/use-events";
import { useDayHighlights } from "@/hooks/use-highlights";
import { useJournalEntryDays } from "@/hooks/use-journal";
import { useLinkedTargets } from "@/hooks/use-links";
import { useBacklinks } from "@/hooks/use-links";
import { useTimeGrid } from "@/hooks/use-time-grid";
import { getDueDateInfo } from "@/lib/tasks/tasks";
import { stripRefs } from "@/lib/links/tokens";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { useToast } from "@/components/toast/ToastProvider";
import { deleteHighlight, restoreHighlight, type Highlight } from "@/lib/highlights/highlights";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { dayApp } from "@/lib/shared/destinations";
import { systemPageId } from "@/lib/notes/system-pages";
import { localDateKey } from "@/lib/tracker/day-keys";
import { cn } from "@/lib/shared/utils";
import { summarizeDay } from "@/lib/tracker/day-summary";
import { COLOR_HEX } from "@/components/tracker/widgets/types";

/** The trailing action on a highlight's row (remove), matching the row's height. */
const MAJOR_EVENT_ROW_ACTION =
  "grid w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground dark:bg-card/80";

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
        {count ? <span className="text-[11px] font-normal tabular-nums text-muted-foreground/70">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

export function DaySurface() {
  const pathname = usePathname();
  const router = useRouter();

  // Read from the path rather than the route's params, so the one prerendered
  // `/day` shell can serve `/day/<any date>` — which is what lets an unvisited
  // date open offline (see next.config.ts). Bare `/day` means today.
  //
  // An unreadable date reads as today rather than an error page: the URL is
  // something other surfaces build, and a wrong one shouldn't be a dead end.
  const dateParam = pathname.split("/")[2];
  const date = useMemo(() => {
    const parsed = dateParam ? parseISO(dateParam) : new Date();
    return isValid(parsed) ? parsed : new Date();
  }, [dateParam]);
  const dateKey = localDateKey(date);
  const days = useMemo(() => [date], [date]);

  const grid = useTimeGrid(days);
  const [activeActivity, setActiveActivity] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isToday = dateKey === localDateKey(new Date());
  const tasks = useDayTasks(dateKey);
  const { occurrences } = useDayOccurrences(dateKey);
  const captures = useDayCaptures(dateKey);
  const subjectLabels = useSubjectLabels(
    useMemo(() => occurrences.map((occurrence) => ({ id: occurrence.thingId, kind: occurrence.subjectKind })), [occurrences]),
  );

  // The journal page this day owns: the anchor a `[[day]]` reference points at,
  // and the row that says whether anything was written here. Without the second,
  // a day with an entry still opens on the empty prompt.
  const userId = useCurrentUserId();
  const journalPageId = userId ? systemPageId(userId, "journal", dateKey) : null;
  const hasJournalEntry = useJournalEntryDays(days).has(dateKey);
  const linkedJournals = useLinkedTargets(
    useMemo(() => (userId ? [systemPageId(userId, "journal", dateKey)] : []), [userId, dateKey]),
  );
  const linkedFrom = useBacklinks(journalPageId);

  const summary = useMemo(
    () =>
      summarizeDay(dateKey, (hourKey) => {
        const cell = grid.data.get(hourKey);
        if (!cell?.activityName) return null;
        return { activity: cell.activityName, hex: COLOR_HEX[grid.colorMap[cell.activityName]] || "#6b7280" };
      }),
    [dateKey, grid.data, grid.colorMap],
  );

  const highlights = useDayHighlights(dateKey);
  const { toast } = useToast();
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<Highlight | null>(null);

  const openHighlight = (event: Highlight | null) => {
    setEditingHighlight(event);
    setHighlightOpen(true);
  };

  // Deleting keeps the record in hand so Undo can re-insert it with the same id
  // and rank — the app's reversible-delete pattern, not a confirm dialog.
  const removeHighlight = (event: Highlight) => {
    void deleteHighlight(event.id).then(() => {
      const { id, sortRank, ...content } = event;
      toast({
        message: `Removed “${event.title}”`,
        actionLabel: "Undo",
        onAction: () => void restoreHighlight(id, content, sortRank),
      });
    });
  };

  const step = (delta: number) => router.push(`/day/${localDateKey(addDays(date, delta))}`, {
    transitionTypes: [delta < 0 ? "day-prev" : "day-next"],
  });

  return (
    <>
      <AppHeader app={dayApp} />

      <ViewTransition
        enter={{ "day-prev": "day-prev", "day-next": "day-next", default: "none" }}
        exit={{ "day-prev": "day-prev", "day-next": "day-next", default: "none" }}
        default="none"
      >
      <div className="skeleton-settle-in mx-auto max-w-3xl space-y-6 px-[var(--app-gutter-x)] py-6 pb-40">
        <header className="flex items-start justify-between gap-3">
          {/* The date itself is the picker: two arrows alone make last month a
              dozen clicks. */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger className="-mx-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-accent">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{format(date, "EEEE")}</h1>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {format(date, "d MMMM yyyy")}
                <ChevronDown className="h-3.5 w-3.5" />
              </p>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                defaultMonth={date}
                onSelect={(picked) => {
                  setPickerOpen(false);
                  if (picked) router.push(`/day/${localDateKey(picked)}`);
                }}
              />
            </PopoverContent>
          </Popover>

          {/* Day navigation, with the highlight flag at its head: marking a day
              belongs with moving between them. */}
          <div className="flex items-center gap-1 pt-1">
            {!isToday ? (
              <button
                type="button"
                onClick={() => router.push(`/day/${localDateKey(new Date())}`)}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Today
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => openHighlight(null)}
              aria-label="Mark a highlight"
              title="Mark a highlight"
              className={cn(
                "relative grid size-8 place-items-center rounded-full transition-colors",
                highlights.length > 0
                  ? "bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Flag className="h-4 w-4" aria-hidden />
              {highlights.length > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-rose-600 px-0.5 text-[9px] font-semibold leading-none text-white dark:bg-rose-500">
                  {highlights.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous day"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next day"
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <Section title="Journal">
          <DailyJournalEntry
            date={date}
            placeholder="Write about this day…"
            hasEntry={hasJournalEntry}
            isLinked={!!userId && linkedJournals.has(systemPageId(userId, "journal", dateKey))}
          />
        </Section>

        {highlights.length > 0 ? (
          <Section title="Highlights" count={highlights.length}>
            <div className="space-y-1.5">
              {highlights.map((event) => (
                <div key={event.id} className="flex items-stretch gap-1">
                  {/* The row opens the editor: this lists the day it is on, so a
                      link to that day would go nowhere. */}
                  <button
                    type="button"
                    onClick={() => openHighlight(event)}
                    className={cn(ENTITY_ROW_CLASS, "flex-1")}
                  >
                    {event.emoji ? (
                      <SpriteIcon name={event.emoji} size={15} />
                    ) : (
                      <Flag className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{event.title}</span>
                    {event.note ? (
                      <span className="shrink-0 max-w-[45%] truncate text-[11px] text-muted-foreground/70">{event.note}</span>
                    ) : null}
                    <SelectedTagPills tagIds={event.tagIds} max={2} className="shrink-0 justify-end" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHighlight(event)}
                    aria-label={`Remove ${event.title}`}
                    className={cn(MAJOR_EVENT_ROW_ACTION, "hover:text-destructive")}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="The day">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/40 dark:bg-card/80 p-4">
            <MoodPicker dateKey={dateKey} prompt="How was it?" />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{summary.totalHours}</span>
              <span className="text-sm text-muted-foreground">
                {summary.totalHours === 1 ? "hour tracked" : "hours tracked"}
              </span>
            </div>
            {summary.activities.length > 0 ? (
              <ul className="space-y-1.5">
                {summary.activities.map((activity) => (
                  <li key={activity.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: activity.hex }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{activity.name}</span>
                    <span className="tabular-nums text-muted-foreground">{activity.count}h</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing tracked yet — paint the grid below.</p>
            )}
          </div>
        </Section>

        <Section title="Hours">
          <div className="space-y-3">
            {/* The same brush the week view paints with, so the gesture carries over. */}
            <ActivityToolbar
              activities={grid.activityTypes.map((activity) => ({
                name: activity.name ?? "",
                color: activity.color ?? "teal",
              }))}
              active={activeActivity}
              onSelect={setActiveActivity}
            />
            <TimeGrid
              days={days}
              data={grid.data}
              colorMap={grid.colorMap}
              onCellClick={(day, hour, existing) => {
                if (!activeActivity) return;
                void grid.setCell(day, hour, existing, activeActivity === "__eraser__" ? null : activeActivity);
              }}
              ratings={grid.ratings}
              onRate={(key, score) => void grid.setRating(key, score)}
              moods={grid.moods}
            />
          </div>
        </Section>

        {tasks.due.length > 0 || tasks.completed.length > 0 ? (
          <Section title="Tasks" count={tasks.due.length + tasks.completed.length}>
            <ul className="space-y-1.5">
              {tasks.completed.map((task) => (
                <li key={task.id}>
                  <EntityRow kind="task" id={task.id} done trailing="done">
                    {stripRefs(task.title ?? "") || "Untitled task"}
                  </EntityRow>
                </li>
              ))}
              {tasks.due.map((task) => (
                <li key={task.id}>
                  <EntityRow
                    kind="task"
                    id={task.id}
                    trailing={task.due_date ? getDueDateInfo(new Date(task.due_date)).label : "due"}
                  >
                    {stripRefs(task.title ?? "") || "Untitled task"}
                  </EntityRow>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {occurrences.length > 0 ? (
          <Section title="Logged" count={occurrences.length}>
            <ul className="space-y-1.5">
              {occurrences.map((occurrence) => (
                <li key={occurrence.id}>
                  {/* The row opens the subject that was logged, not the log line:
                      an occurrence has no page of its own. */}
                  <EntityRow
                    kind={occurrence.subjectKind ?? "event"}
                    id={occurrence.thingId}
                    trailing={
                      occurrence.at ? <span className="tabular-nums">{format(new Date(occurrence.at), "HH:mm")}</span> : null
                    }
                  >
                    {occurrence.action ? <span className="font-medium">{occurrence.action} </span> : null}
                    {subjectLabels.get(occurrence.thingId) ?? "Something"}
                  </EntityRow>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {captures.bookmarks.length + captures.quotes.length + captures.notes.length > 0 ? (
          <Section
            title="Saved"
            count={captures.bookmarks.length + captures.quotes.length + captures.notes.length}
          >
            <ul className="space-y-1.5">
              {captures.notes.map((note) => (
                <li key={note.id}>
                  <EntityRow kind="note" id={note.id} href={`/notes/${note.id}`}>
                    {note.title || "Untitled page"}
                  </EntityRow>
                </li>
              ))}
              {captures.bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <EntityRow kind="bookmark" id={bookmark.id}>
                    {bookmark.title || bookmark.url}
                  </EntityRow>
                </li>
              ))}
              {captures.quotes.map((quote) => (
                <li key={quote.id}>
                  <EntityRow kind="quote" id={quote.id}>
                    {stripRefs(quote.text ?? "") || "Untitled quote"}
                  </EntityRow>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {linkedFrom.length > 0 ? (
          <Section title="Linked from" count={linkedFrom.length}>
            <ul className="space-y-1.5">
              {linkedFrom.map((source) => (
                <li key={`${source.kind}:${source.id}`}>
                  <EntityRow
                    kind={source.kind}
                    id={source.id}
                    href={source.kind === "note" ? `/notes/${source.id}` : undefined}
                  >
                    {source.label}
                  </EntityRow>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
      </ViewTransition>

      <MobileBottomFabs app={dayApp} />

      <HighlightDialog
        open={highlightOpen}
        onOpenChange={(next) => {
          setHighlightOpen(next);
          if (!next) setEditingHighlight(null);
        }}
        date={date}
        event={editingHighlight}
      />
    </>
  );
}

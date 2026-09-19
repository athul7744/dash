"use client";

/**
 * One calendar day, across every app.
 *
 * Tracker is the only app with no per-entity anchor — its rows are keyed by date
 * rather than by an id — so the day itself is the join. This page is the reader:
 * what you tracked, what you meant to do, what you logged, what you kept, and
 * what you wrote, for a single `yyyy-MM-dd`.
 *
 * Sections stay separate on purpose. Tracker's timestamps are UTC-naive while
 * everything else is a real instant, so interleaving them into one chronological
 * feed would order them wrongly by the viewer's UTC offset (see `day-keys.ts`).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { addDays, format, isValid, parseISO } from "date-fns";
import {
  Bookmark as BookmarkIcon,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Quote as QuoteIcon,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActivityToolbar } from "@/components/tracker/ActivityToolbar";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { DailyJournalEntry } from "@/components/journal/DailyJournalEntry";
import { TimeGrid } from "@/components/tracker/TimeGrid";
import { MoodPicker } from "@/components/dashboard/MoodPicker";
import { useDayCaptures, useDayOccurrences, useDayTasks } from "@/hooks/use-day";
import { useSubjectLabels } from "@/hooks/use-events";
import { useTimeGrid } from "@/hooks/use-time-grid";
import { getDueDateInfo } from "@/lib/tasks/tasks";
import { type AppConfig } from "@/lib/shared/apps";
import { localDateKey } from "@/lib/tracker/day-keys";
import { summarizeDay } from "@/lib/tracker/day-summary";
import { COLOR_HEX } from "@/components/tracker/widgets/types";

// A day isn't an app — it's a cross-app destination, like Trash — so it carries
// its own identity rather than borrowing Tracker's.
const dayApp: AppConfig = {
  id: "day",
  name: "Day",
  description: "Everything one day holds, across every app",
  href: "/day",
  icon: CalendarDays,
  accent: {
    // A deeper green than Tracker's teal: near enough to read as time, far
    // enough not to be mistaken for the tracker itself.
    iconBg: "bg-emerald-600/10 dark:bg-emerald-500/20",
    iconText: "text-emerald-700 dark:text-emerald-400",
    hoverText: "hover:text-emerald-800 dark:hover:text-emerald-300",
  },
};

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

export default function DayPage() {
  const params = useParams<{ date: string }>();
  const router = useRouter();

  // An unreadable date reads as today rather than an error page: the URL is
  // something other surfaces build, and a wrong one shouldn't be a dead end.
  const dateParam = params?.date;
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

  const summary = useMemo(
    () =>
      summarizeDay(dateKey, (hourKey) => {
        const cell = grid.data.get(hourKey);
        if (!cell?.activityName) return null;
        return { activity: cell.activityName, hex: COLOR_HEX[grid.colorMap[cell.activityName]] || "#6b7280" };
      }),
    [dateKey, grid.data, grid.colorMap],
  );

  const step = (delta: number) => router.push(`/day/${localDateKey(addDays(date, delta))}`);

  return (
    <>
      <AppHeader app={dayApp} />

      <div className="skeleton-settle-in mx-auto max-w-3xl space-y-6 px-[var(--app-gutter-x)] py-6 pb-40">
        <header className="flex items-center justify-between gap-3">
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
          <div className="flex items-center gap-1">
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

        <Section title="The day">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/50 p-4">
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
                <li key={task.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                  <span className="min-w-0 flex-1 truncate line-through text-muted-foreground">{task.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">done</span>
                </li>
              ))}
              {tasks.due.map((task) => (
                <li key={task.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {task.due_date ? getDueDateInfo(new Date(task.due_date)).label : "due"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {occurrences.length > 0 ? (
          <Section title="Logged" count={occurrences.length}>
            <ul className="space-y-1.5">
              {occurrences.map((occurrence) => (
                <li key={occurrence.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {occurrence.action ? <span className="font-medium">{occurrence.action} </span> : null}
                    {subjectLabels.get(occurrence.thingId) ?? "Something"}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                    {occurrence.at ? format(new Date(occurrence.at), "HH:mm") : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {captures.bookmarks.length + captures.quotes.length + captures.notes.length > 0 ? (
          <Section
            title="Kept"
            count={captures.bookmarks.length + captures.quotes.length + captures.notes.length}
          >
            <ul className="space-y-1.5">
              {captures.notes.map((note) => (
                <li key={note.id}>
                  <Link
                    href={`/notes/${note.id}`}
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm transition-colors hover:border-border"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <span className="min-w-0 flex-1 truncate">{note.title || "Untitled page"}</span>
                  </Link>
                </li>
              ))}
              {captures.bookmarks.map((bookmark) => (
                <li key={bookmark.id}>
                  <a
                    href={bookmark.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm transition-colors hover:border-border"
                  >
                    <BookmarkIcon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                    <span className="min-w-0 flex-1 truncate">{bookmark.title || bookmark.url}</span>
                  </a>
                </li>
              ))}
              {captures.quotes.map((quote) => (
                <li
                  key={quote.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm"
                >
                  <QuoteIcon className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span className="min-w-0 flex-1 truncate">{quote.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section title="Journal">
          <DailyJournalEntry date={date} placeholder="Write about this day…" />
        </Section>
      </div>

      <MobileBottomFabs app={dayApp} />
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Flag } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { CollectionHeading } from "@/components/CollectionHeading";
import { HighlightDialog } from "@/components/day/HighlightDialog";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { TagColorMark } from "@/components/tags/TagColorMark";
import { YearSelect } from "@/components/tracker/YearSelect";
import { Skeleton } from "@/components/ui/skeleton";
import { useHighlightsByYear } from "@/hooks/use-highlights";
import { useAllTags } from "@/hooks/use-tags";
import { yearApp } from "@/lib/shared/destinations";
import { type Highlight } from "@/lib/highlights/highlights";
import { tagColors } from "@/lib/tasks/colors";
import { localDayFromKey } from "@/lib/tracker/day-keys";
import { cn } from "@/lib/shared/utils";

/**
 * The year list: every highlight as a card on a timeline, newest year first.
 *
 * A card opens the event's editor — this page is where the year is read and
 * corrected, while the day itself is one click away from the day surface. Years
 * with nothing in them are not rendered, so the page reads as the years that had
 * turning points rather than a wall of empty headings.
 */
export default function YearPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { years, isLoading } = useHighlightsByYear();
  const { tags: allTags } = useAllTags();

  const availableYears = useMemo(() => years.map((entry) => entry.year), [years]);
  const currentYear = new Date().getFullYear();
  const yearChoices = useMemo(
    () => (availableYears.includes(currentYear) ? availableYears : [currentYear, ...availableYears]),
    [availableYears, currentYear],
  );

  // `?year=` is the whole selection: the newest year is the default and is the one
  // state with no param, so the list is deep-linkable and the back button walks
  // the years. Nothing is copied into state.
  const requestedYear = Number(searchParams.get("year"));
  const urlYear = Number.isFinite(requestedYear) && requestedYear > 0 ? requestedYear : null;
  const selectedYear = urlYear ?? availableYears[0] ?? currentYear;

  // Scroll the deep-linked year into view once, when its section exists.
  const scrolledForRef = useRef<number | null>(null);
  useEffect(() => {
    if (urlYear == null || scrolledForRef.current === urlYear) return;
    const section = document.getElementById(`year-${urlYear}`);
    if (!section) return;
    scrolledForRef.current = urlYear;
    section.scrollIntoView({ block: "start" });
  }, [urlYear, years.length]);

  const chooseYear = (year: number) => {
    document.getElementById(`year-${year}`)?.scrollIntoView({ block: "start" });
    const params = new URLSearchParams(searchParams.toString());
    const isLatest = year === availableYears[0];
    if (isLatest) params.delete("year");
    else params.set("year", String(year));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Marking from here writes to today; a card opens its own event for editing.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const today = useMemo(() => new Date(), []);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (event: Highlight) => {
    setEditing(event);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <AppHeader app={yearApp} />

      <main className="flex-1 overflow-y-auto overflow-x-hidden px-[var(--app-gutter-x)] py-6 pb-40">
        <div className="mx-auto flex max-w-5xl gap-8">
          {/* Year rail (desktop) — the years that exist, newest first. */}
          {years.length > 1 ? (
            <nav aria-label="Years" className="sticky top-6 hidden h-fit w-28 shrink-0 flex-col gap-1 lg:flex">
              {years.map((entry) => (
                <button
                  key={entry.year}
                  type="button"
                  onClick={() => chooseYear(entry.year)}
                  aria-current={entry.year === selectedYear ? "true" : undefined}
                  className={cn(
                    "flex items-baseline justify-between rounded-lg px-2 py-1 text-sm transition-colors",
                    entry.year === selectedYear
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="tabular-nums">{entry.year}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">{entry.events.length}</span>
                </button>
              ))}
            </nav>
          ) : null}

          <div className="min-w-0 flex-1">
            {years.length > 0 ? (
              <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
                <p className="text-sm font-semibold text-foreground">Highlights</p>
                <YearSelect years={yearChoices} value={selectedYear} onChange={chooseYear} />
              </div>
            ) : null}

            {isLoading && years.length === 0 ? (
              <YearTimelineSkeleton />
            ) : years.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div className="rounded-2xl bg-rose-500/10 p-3 dark:bg-rose-500/20">
                  <Flag className="h-6 w-6 text-rose-600 dark:text-rose-400" aria-hidden />
                </div>
                <p className="font-serif text-lg text-foreground">No highlights yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Mark a day — the things worth remembering a year from now, kept out of the daily log.
                </p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-rose-500"
                >
                  <Flag className="h-4 w-4" aria-hidden />
                  Mark today
                </button>
              </div>
            ) : (
              <div className="space-y-10">
                {years.map((entry) => (
                  <section key={entry.year} id={`year-${entry.year}`} className="scroll-mt-6">
                    <CollectionHeading label={String(entry.year)} count={entry.events.length} className="mb-4" />

                    {/* Timeline: a rail with a dot per event and a card to open it. */}
                    <div className="relative">
                      <span aria-hidden className="absolute inset-y-2 left-[7px] w-px bg-border" />
                      <ul className="space-y-2.5">
                        {entry.events.map((event) => {
                          // The rail mark wears the event's tag colours, so the year
                          // reads in the same colours as its tags.
                          return (
                          <li key={event.id} className="relative pl-7">
                            <TagColorMark
                              colors={tagColors(event.tagIds, allTags)}
                              size={14}
                              className="absolute left-0 top-[26px] ring-2 ring-background"
                            />
                            <button
                              type="button"
                              onClick={() => openEdit(event)}
                              className="w-full rounded-xl border border-border/60 bg-muted/40 p-3.5 text-left transition-colors hover:border-border hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-card/80"
                            >
                              <div className="flex items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                                  {event.emoji ? (
                                    <SpriteIcon name={event.emoji} size={18} />
                                  ) : (
                                    <Flag className="h-4 w-4 text-muted-foreground/60" aria-hidden />
                                  )}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline justify-between gap-3">
                                    <p className="min-w-0 flex-1 truncate text-[15px] font-medium leading-6 text-foreground">{event.title}</p>
                                    <span className="w-[5.5rem] shrink-0 text-right text-[11px] leading-6 tabular-nums text-muted-foreground/70">
                                      {format(localDayFromKey(event.at), "EEE, d MMM")}
                                    </span>
                                  </div>
                                  {event.note ? (
                                    <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">{event.note}</p>
                                  ) : null}
                                  <SelectedTagPills tagIds={event.tagIds} className="mt-1.5" />
                                </div>
                              </div>
                            </button>
                          </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <MobileBottomFabs
        app={yearApp}
        centerContent={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
          >
            <Flag className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
            Mark today
          </button>
        }
      />

      <HighlightDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditing(null);
        }}
        date={editing?.at ? localDayFromKey(editing.at) : today}
        event={editing}
      />
    </div>
  );
}

/** Two year sections' worth of cards, in the shape the timeline lands in. */
function YearTimelineSkeleton() {
  return (
    <div className="space-y-10">
      {[0, 1].map((section) => (
        <div key={section}>
          <div className="mb-4 flex items-baseline gap-3">
            <Skeleton className="h-3 w-12" />
            <div className="h-px flex-1 bg-border/40" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, row) => (
              <Skeleton key={row} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

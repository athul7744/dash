"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { moodByValue, moodHex, type Mood } from "@/lib/tracker/moods";
import {
  YEAR_INSIGHTS_MONTHS,
  YEAR_INSIGHTS_WEEKDAYS,
  type ActivityYearInsights as ActivityInsights,
  type ActivityDetail,
  type SleepInsights,
  type MoodYearInsights as MoodInsights,
  type MoodLevelDetail,
} from "@/lib/tracker/year-insights";
import { cn } from "@/lib/shared/utils";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const SLEEP_HEX = "#6366f1"; // indigo — sleep's own accent, matching the prototype

/* ── Small shared primitives ─────────────────────────────────────── */

function SectionLabel({ children }: { children: string }) {
  return <h4 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>;
}

/* ── Activity: drillable chart + detail primitives ───────────────── */

/**
 * A single-series bar chart with a hover callback. Bars fill to `hex`; empty
 * bars show a faint track. `onHover(i | null)` drives the parent's readout so
 * the exact figure sits in one shared place (not a tooltip per bar).
 */
function BarChart({
  values,
  labels,
  hex,
  onHover,
  variant = "month",
}: {
  values: number[];
  labels: string[];
  hex: string;
  onHover: (index: number | null) => void;
  variant?: "month" | "week";
}) {
  const max = Math.max(1, ...values);
  // Each column is a full-height button so the whole bar is tappable (touch) and
  // focusable — not just the coloured sliver. Hover and tap both drive the readout.
  return (
    <div>
      <div className="flex h-13 items-end gap-[3px]" onMouseLeave={() => onHover(null)}>
        {values.map((v, i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => onHover(i)}
            onClick={() => onHover(i)}
            aria-label={`${labels[i]}: ${v}`}
            className="group flex h-full flex-1 items-end"
          >
            <span
              className={cn(
                "block w-full min-h-[2px] transition-[filter] group-hover:brightness-110",
                variant === "week" ? "rounded-sm" : "rounded-t-sm",
                v <= 0 && "bg-muted-foreground/15",
              )}
              style={v > 0 ? { height: `${Math.max(6, (v / max) * 100)}%`, backgroundColor: hex } : { height: "2px" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[0.6rem] text-muted-foreground">{l}</span>
        ))}
      </div>
    </div>
  );
}

/** A hoverable readout line that falls back to a hint when nothing is hovered. */
function Readout({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 min-h-[1.05rem] text-[0.7rem] leading-tight text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{children}</p>;
}

function DetailStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <div className="font-heading text-base font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function DetailChart({ eyebrow, chart }: { eyebrow: string; chart: ReactNode }) {
  return (
    <section>
      <SectionLabel>{eyebrow}</SectionLabel>
      {chart}
    </section>
  );
}

/** One activity row in the explorer: dot · name · hours · % · share bar. */
function ActivityRow({ activity, onOpen }: { activity: ActivityDetail; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activity.hex }} />
      <span className="truncate text-[0.8rem] font-medium text-foreground">{activity.name}</span>
      <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
        <b className="font-semibold text-foreground">{activity.hours}</b>h · {Math.round(activity.percentage)}%
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </span>
      {/* Bar tracks share of tracked time, so it matches the % shown. */}
      <span className="col-span-3 h-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${activity.percentage}%`, backgroundColor: activity.hex }} />
      </span>
    </button>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mb-2.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
      <ChevronLeft className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function ActivityDetailView({ activity, onBack, fill }: { activity: ActivityDetail; onBack: () => void; fill?: boolean }) {
  const [hover, setHover] = useState<{ chart: "month" | "week"; i: number } | null>(null);
  const pct = Math.round(activity.percentage);
  const recency = activity.daysSinceLast === null ? "—" : activity.daysSinceLast === 0 ? "today" : `${activity.daysSinceLast} days ago`;

  let readout: ReactNode = "Tap or hover a bar for its value";
  if (hover?.chart === "month") {
    const v = activity.monthly[hover.i];
    readout = v > 0 ? <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · <b>{v}</b> h</> : <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · —</>;
  } else if (hover?.chart === "week") {
    readout = <><b>{YEAR_INSIGHTS_WEEKDAYS[hover.i]}</b> · <b>{activity.weekday[hover.i]}</b> h avg</>;
  }

  return (
    <div className={cn("animate-fade-slide-in", fill && "h-full overflow-y-auto")}>
      <BackButton onClick={onBack} label="Activities" />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: activity.hex }} />
        <h3 className="font-heading text-base font-semibold text-foreground">{activity.name}</h3>
      </div>
      <p className="mt-0.5 mb-3.5 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <b>{activity.hours}</b> h this year · <b>{pct}%</b> of tracked time
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <DetailStat value={`${activity.avgPerActiveDay}h`} label="avg / active day" />
        <DetailStat value={String(activity.activeDays)} label="days done" />
        <DetailStat value={`${activity.longestStreak}d`} label="longest streak" />
        <DetailStat value={`${pct}%`} label="share of year" />
      </div>

      <div className="space-y-3.5">
        <DetailChart
          eyebrow="Across the year"
          chart={<BarChart values={activity.monthly} labels={MONTH_INITIALS} hex={activity.hex} onHover={(i) => setHover(i === null ? null : { chart: "month", i })} />}
        />
        <DetailChart
          eyebrow="By weekday · avg per day"
          chart={<BarChart values={activity.weekday} labels={WEEKDAY_INITIALS} hex={activity.hex} variant="week" onHover={(i) => setHover(i === null ? null : { chart: "week", i })} />}
        />
      </div>

      <Readout>{readout}</Readout>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <div className="flex justify-between"><span>Peak month</span><span><b>{YEAR_INSIGHTS_MONTHS[activity.peakMonth]}</b> · <b>{activity.monthly[activity.peakMonth]}</b> h</span></div>
        <div className="flex justify-between"><span>Last done</span><b>{recency}</b></div>
      </div>
    </div>
  );
}

function SleepDetailView({ sleep, onBack, fill }: { sleep: SleepInsights; onBack: () => void; fill?: boolean }) {
  const [hover, setHover] = useState<{ chart: "month" | "week"; i: number } | null>(null);
  const range = Math.round((sleep.byMonth[sleep.bestMonth] - sleep.byMonth[sleep.worstMonth]) * 10) / 10;

  let readout: ReactNode = "Tap or hover a bar for its value";
  if (hover?.chart === "month") {
    const v = sleep.byMonth[hover.i];
    readout = v > 0 ? <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · <b>{v}</b> h / night</> : <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · —</>;
  } else if (hover?.chart === "week") {
    readout = <><b>{YEAR_INSIGHTS_WEEKDAYS[hover.i]}</b> · <b>{sleep.byWeekday[hover.i]}</b> h / night</>;
  }

  return (
    <div className={cn("animate-fade-slide-in", fill && "h-full overflow-y-auto")}>
      <BackButton onClick={onBack} label="Activities" />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SLEEP_HEX }} />
        <h3 className="font-heading text-base font-semibold text-foreground">Sleep</h3>
      </div>
      <p className="mt-0.5 mb-3.5 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <b>{sleep.avg}</b> h / night on average this year
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <DetailStat value={`${sleep.avg}h`} label="avg / night" />
        <DetailStat value={`±${range}h`} label="month range" />
        <DetailStat value={`${YEAR_INSIGHTS_MONTHS[sleep.bestMonth]} · ${sleep.byMonth[sleep.bestMonth]}h`} label="best month" />
        <DetailStat value={`${YEAR_INSIGHTS_MONTHS[sleep.worstMonth]} · ${sleep.byMonth[sleep.worstMonth]}h`} label="worst month" />
      </div>

      <div className="space-y-3.5">
        <DetailChart
          eyebrow="Across the year · per night"
          chart={<BarChart values={sleep.byMonth} labels={MONTH_INITIALS} hex={SLEEP_HEX} onHover={(i) => setHover(i === null ? null : { chart: "month", i })} />}
        />
        <DetailChart
          eyebrow="By weekday · per night"
          chart={<BarChart values={sleep.byWeekday} labels={WEEKDAY_INITIALS} hex={SLEEP_HEX} variant="week" onHover={(i) => setHover(i === null ? null : { chart: "week", i })} />}
        />
      </div>

      <Readout>{readout}</Readout>
    </div>
  );
}

/* ── Content: Activity year ──────────────────────────────────────── */

export function ActivityYearInsights({ insights, fill }: { insights: ActivityInsights; fill?: boolean }) {
  const { totalHours, monthlyTotals, activities, sleep } = insights;
  const [selected, setSelected] = useState<{ kind: "activity"; idx: number } | { kind: "sleep" } | null>(null);
  const [sparkHover, setSparkHover] = useState<number | null>(null);

  if (totalHours === 0) {
    return <p className="text-sm text-muted-foreground">No activity logged yet.</p>;
  }

  if (selected?.kind === "activity") {
    return <ActivityDetailView activity={activities[selected.idx]} onBack={() => setSelected(null)} fill={fill} />;
  }
  if (selected?.kind === "sleep" && sleep) {
    return <SleepDetailView sleep={sleep} onBack={() => setSelected(null)} fill={fill} />;
  }

  const sparkMax = Math.max(1, ...monthlyTotals);

  return (
    // In `fill` mode (mobile dialog) the panel fills a bounded height: the total
    // and sleep stay pinned while only the activities list scrolls, so the sleep
    // stats are always in view.
    <div className={cn("animate-fade-slide-in", fill ? "flex h-full flex-col" : "space-y-4")}>
      {/* Total — the headline figure, with a monthly sparkline. */}
      <div className={cn(fill && "shrink-0")}>
        <div className="flex items-end justify-between gap-3">
          <div className="font-heading text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {totalHours.toLocaleString()}<span className="ml-1 align-baseline text-lg font-semibold text-muted-foreground">h</span>
          </div>
          <div className="flex h-8 items-end gap-[2px]" onMouseLeave={() => setSparkHover(null)}>
            {monthlyTotals.map((v, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setSparkHover(i)}
                onClick={() => setSparkHover(i)}
                aria-label={`${YEAR_INSIGHTS_MONTHS[i]}: ${v} h`}
                className="flex h-full items-end"
              >
                <span
                  className={cn("block w-1.5 rounded-sm bg-primary/45 transition-colors hover:bg-primary", v <= 0 && "opacity-30")}
                  style={{ height: v > 0 ? `${Math.max(10, (v / sparkMax) * 100)}%` : "10%" }}
                />
              </button>
            ))}
          </div>
        </div>
        <Readout>
          {sparkHover === null ? (
            "hours logged so far this year"
          ) : monthlyTotals[sparkHover] > 0 ? (
            <><b>{YEAR_INSIGHTS_MONTHS[sparkHover]}</b> · <b>{monthlyTotals[sparkHover]}</b> h logged</>
          ) : (
            <><b>{YEAR_INSIGHTS_MONTHS[sparkHover]}</b> · not yet</>
          )}
        </Readout>
      </div>

      {/* Activities explorer — the centerpiece; the only scrolling region in `fill`. */}
      <div className={cn("border-t border-border pt-3", fill ? "mt-4 flex min-h-0 flex-1 flex-col" : "")}>
        <SectionLabel>Activities · hours</SectionLabel>
        <div className={cn("-mx-1.5", fill && "min-h-[7rem] flex-1 overflow-y-auto")}>
          {activities.map((a, idx) => (
            <ActivityRow key={a.name} activity={a} onOpen={() => setSelected({ kind: "activity", idx })} />
          ))}
        </div>
      </div>

      {/* Sleep per night — kept and drillable; always in view. */}
      {sleep && (
        <button
          type="button"
          onClick={() => setSelected({ kind: "sleep" })}
          className={cn("block w-full border-t border-border pt-3 text-left", fill ? "mt-3 shrink-0" : "")}
        >
          <div className="flex items-baseline justify-between">
            <SectionLabel>Sleep · avg per night</SectionLabel>
            <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <b className="font-semibold text-foreground">{sleep.avg}</b>h
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
            </span>
          </div>
          <div className="mt-2 flex h-12 items-end gap-[3px]">
            {(() => {
              const max = Math.max(1, ...sleep.byMonth);
              return sleep.byMonth.map((v, i) => (
                <span
                  key={i}
                  className={cn("flex-1 rounded-sm", v <= 0 && "bg-muted-foreground/15")}
                  style={v > 0 ? { height: `${Math.max(10, (v / max) * 100)}%`, backgroundColor: SLEEP_HEX } : { height: "3px" }}
                />
              ));
            })()}
          </div>
          <div className="mt-1.5 flex gap-[3px]">
            {MONTH_INITIALS.map((l, i) => (
              <span key={i} className="flex-1 text-center text-[0.6rem] text-muted-foreground">{l}</span>
            ))}
          </div>
        </button>
      )}
    </div>
  );
}

/* ── Mood: drillable chart + detail primitives ───────────────────── */

/**
 * Avg-mood bar chart: each bar is coloured by its own average mood (ordinal
 * scale), heights normalised to the mood range. Nulls (no ratings) read faint.
 * Used for the headline sparkline, the weekly-rhythm strip, and the avg charts.
 */
function MoodAvgBars({
  values,
  labels,
  moods,
  onHover,
  variant = "month",
}: {
  values: (number | null)[];
  labels: string[];
  moods: Mood[];
  onHover: (index: number | null) => void;
  variant?: "month" | "week";
}) {
  const lo = Math.min(...moods.map((m) => m.value));
  const hi = Math.max(...moods.map((m) => m.value));
  const span = Math.max(1, hi - lo);
  return (
    <div>
      <div className="flex h-13 items-end gap-[3px]" onMouseLeave={() => onHover(null)}>
        {values.map((v, i) => {
          const has = v !== null;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => onHover(i)}
              onClick={() => onHover(i)}
              aria-label={`${labels[i]}: ${has ? v : "—"}`}
              className="group flex h-full flex-1 items-end"
            >
              <span
                className={cn(
                  "block w-full min-h-[2px] transition-[filter] group-hover:brightness-110",
                  variant === "week" ? "rounded-sm" : "rounded-t-sm",
                  !has && "bg-muted-foreground/15",
                )}
                style={has ? { height: `${Math.max(12, ((v - lo) / span) * 100)}%`, backgroundColor: moodHex(moodByValue(moods, Math.round(v))) } : { height: "2px" }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center text-[0.6rem] text-muted-foreground">{l}</span>
        ))}
      </div>
    </div>
  );
}

/** One mood row in the explorer: dot · label · days · % · share bar. */
function MoodRow({ mood, onOpen }: { mood: MoodLevelDetail; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mood.hex }} />
      <span className="truncate text-[0.8rem] font-medium text-foreground">{mood.label}</span>
      <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
        <b className="font-semibold text-foreground">{mood.count}</b> d · {Math.round(mood.percentage)}%
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      </span>
      {/* Bar tracks share of rated days, so it matches the % shown. */}
      <span className="col-span-3 h-1 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${mood.percentage}%`, backgroundColor: mood.hex }} />
      </span>
    </button>
  );
}

function MoodDetailView({ mood, onBack, fill }: { mood: MoodLevelDetail; onBack: () => void; fill?: boolean }) {
  const [hover, setHover] = useState<{ chart: "month" | "week"; i: number } | null>(null);
  const pct = Math.round(mood.percentage);
  const recency = mood.daysSinceLast === null ? "—" : mood.daysSinceLast === 0 ? "today" : `${mood.daysSinceLast} days ago`;

  let readout: ReactNode = "Tap or hover a bar for its value";
  if (hover?.chart === "month") {
    const v = mood.monthly[hover.i];
    readout = v > 0 ? <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · <b>{v}</b> days</> : <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · —</>;
  } else if (hover?.chart === "week") {
    readout = <><b>{YEAR_INSIGHTS_WEEKDAYS[hover.i]}</b> · <b>{mood.weekday[hover.i]}</b> days</>;
  }

  return (
    <div className={cn("animate-fade-slide-in", fill && "h-full overflow-y-auto")}>
      <BackButton onClick={onBack} label="Moods" />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: mood.hex }} />
        <h3 className="font-heading text-base font-semibold text-foreground">{mood.label}</h3>
      </div>
      <p className="mt-0.5 mb-3.5 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <b>{mood.count}</b> days · <b>{pct}%</b> of rated days
      </p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <DetailStat value={String(mood.count)} label="days felt" />
        <DetailStat value={`${pct}%`} label="of rated days" />
        <DetailStat value={`${mood.longestStreak}d`} label="longest run" />
        <DetailStat value={mood.daysSinceLast === 0 ? "today" : mood.daysSinceLast === null ? "—" : `${mood.daysSinceLast}d ago`} label="last felt" />
      </div>

      <div className="space-y-3.5">
        <DetailChart
          eyebrow="Across the year · days"
          chart={<BarChart values={mood.monthly} labels={MONTH_INITIALS} hex={mood.hex} onHover={(i) => setHover(i === null ? null : { chart: "month", i })} />}
        />
        <DetailChart
          eyebrow="By weekday · days"
          chart={<BarChart values={mood.weekday} labels={WEEKDAY_INITIALS} hex={mood.hex} variant="week" onHover={(i) => setHover(i === null ? null : { chart: "week", i })} />}
        />
      </div>

      <Readout>{readout}</Readout>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">
        <div className="flex justify-between"><span>Most in</span><span><b>{YEAR_INSIGHTS_MONTHS[mood.peakMonth]}</b> · <b>{mood.monthly[mood.peakMonth]}</b> days</span></div>
        <div className="flex justify-between"><span>Last felt</span><b>{recency}</b></div>
      </div>
    </div>
  );
}

function RhythmDetailView({ rhythm, weekdayAvg, monthlyAvg, moods, onBack, fill }: {
  rhythm: MoodInsights["rhythm"];
  weekdayAvg: (number | null)[];
  monthlyAvg: (number | null)[];
  moods: Mood[];
  onBack: () => void;
  fill?: boolean;
}) {
  const [hover, setHover] = useState<{ chart: "month" | "week"; i: number } | null>(null);
  const bestVal = weekdayAvg[rhythm.bestWeekday];
  const headHex = bestVal !== null ? moodHex(moodByValue(moods, Math.round(bestVal))) : "var(--muted-foreground)";

  let readout: ReactNode = "Tap or hover a bar for its value";
  if (hover?.chart === "week") {
    const v = weekdayAvg[hover.i];
    readout = v === null ? <><b>{YEAR_INSIGHTS_WEEKDAYS[hover.i]}</b> · —</> : <><b>{YEAR_INSIGHTS_WEEKDAYS[hover.i]}</b> · <b>{moodByValue(moods, Math.round(v))?.label}</b> · <b>{v}</b> avg</>;
  } else if (hover?.chart === "month") {
    const v = monthlyAvg[hover.i];
    readout = v === null ? <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · not rated</> : <><b>{YEAR_INSIGHTS_MONTHS[hover.i]}</b> · <b>{moodByValue(moods, Math.round(v))?.label}</b> · <b>{v}</b> avg</>;
  }

  return (
    <div className={cn("animate-fade-slide-in", fill && "h-full overflow-y-auto")}>
      <BackButton onClick={onBack} label="Moods" />
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: headHex }} />
        <h3 className="font-heading text-base font-semibold text-foreground">Weekly rhythm</h3>
      </div>
      <p className="mt-0.5 mb-3.5 text-xs text-muted-foreground">how your mood moves through the week</p>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <DetailStat value={`${YEAR_INSIGHTS_WEEKDAYS[rhythm.bestWeekday]} · ${bestVal ?? "—"}`} label="best day" />
        <DetailStat value={`${YEAR_INSIGHTS_WEEKDAYS[rhythm.worstWeekday]} · ${weekdayAvg[rhythm.worstWeekday] ?? "—"}`} label="toughest day" />
        <DetailStat value={rhythm.weekendAvg === null ? "—" : String(rhythm.weekendAvg)} label="weekend avg" />
        <DetailStat value={rhythm.weekdayAvg === null ? "—" : String(rhythm.weekdayAvg)} label="weekday avg" />
      </div>

      <div className="space-y-3.5">
        <DetailChart
          eyebrow="By weekday · avg mood"
          chart={<MoodAvgBars values={weekdayAvg} labels={WEEKDAY_INITIALS} moods={moods} variant="week" onHover={(i) => setHover(i === null ? null : { chart: "week", i })} />}
        />
        <DetailChart
          eyebrow="Across the year · avg mood"
          chart={<MoodAvgBars values={monthlyAvg} labels={MONTH_INITIALS} moods={moods} onHover={(i) => setHover(i === null ? null : { chart: "month", i })} />}
        />
      </div>

      <Readout>{readout}</Readout>
    </div>
  );
}

/* ── Content: Mood year ──────────────────────────────────────────── */

export function MoodYearInsights({ insights, moods, fill }: { insights: MoodInsights; moods: Mood[]; fill?: boolean }) {
  const { daysRated, avgMood, ratedPct, elapsedDays, monthlyAvg, weekdayAvg, moods: moodLevels, rhythm } = insights;
  const [selected, setSelected] = useState<{ kind: "mood"; value: number } | { kind: "rhythm" } | null>(null);
  const [sparkHover, setSparkHover] = useState<number | null>(null);

  if (daysRated === 0) {
    return <p className="text-sm text-muted-foreground">No moods rated yet.</p>;
  }

  if (selected?.kind === "mood") {
    const m = moodLevels.find((x) => x.value === selected.value);
    if (m) return <MoodDetailView mood={m} onBack={() => setSelected(null)} fill={fill} />;
  }
  if (selected?.kind === "rhythm") {
    return <RhythmDetailView rhythm={rhythm} weekdayAvg={weekdayAvg} monthlyAvg={monthlyAvg} moods={moods} onBack={() => setSelected(null)} fill={fill} />;
  }

  const avgLevel = moodByValue(moods, Math.round(avgMood));
  const ranked = moodLevels.filter((m) => m.count > 0);
  const lo = Math.min(...moods.map((m) => m.value));
  const hi = Math.max(...moods.map((m) => m.value));
  const span = Math.max(1, hi - lo);

  return (
    // In `fill` mode (dialog) the panel fills a bounded height: the headline and
    // weekly rhythm stay pinned while only the mood explorer scrolls.
    <div className={cn("animate-fade-slide-in", fill ? "flex h-full flex-col" : "space-y-4")}>
      {/* Average headline — the figure, with a monthly-avg sparkline. */}
      <div className={cn(fill && "shrink-0")}>
        <div className="flex items-end justify-between gap-3">
          <div className="font-heading text-4xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            {avgMood}<span className="ml-1 align-baseline text-lg font-semibold text-muted-foreground">/{hi}</span>
          </div>
          <div className="flex h-8 items-end gap-[2px]" onMouseLeave={() => setSparkHover(null)}>
            {monthlyAvg.map((v, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setSparkHover(i)}
                onClick={() => setSparkHover(i)}
                aria-label={`${YEAR_INSIGHTS_MONTHS[i]}: ${v ?? "not rated"}`}
                className="flex h-full items-end"
              >
                <span
                  className={cn("block w-1.5 rounded-sm transition-[filter] hover:brightness-110", v === null && "bg-muted-foreground/25")}
                  style={v !== null ? { height: `${Math.max(10, ((v - lo) / span) * 100)}%`, backgroundColor: moodHex(moodByValue(moods, Math.round(v))) } : { height: "10%" }}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: moodHex(avgLevel) }} />
          {avgLevel?.label} on average
        </div>
        <Readout>
          {sparkHover === null ? (
            <>Rated <b>{daysRated}</b> of {elapsedDays} days · <b>{ratedPct}%</b> covered</>
          ) : monthlyAvg[sparkHover] === null ? (
            <><b>{YEAR_INSIGHTS_MONTHS[sparkHover]}</b> · not rated</>
          ) : (
            <><b>{YEAR_INSIGHTS_MONTHS[sparkHover]}</b> · <b>{moodByValue(moods, Math.round(monthlyAvg[sparkHover] as number))?.label}</b> · <b>{monthlyAvg[sparkHover]}</b> avg</>
          )}
        </Readout>
      </div>

      {/* Mood explorer — the centerpiece; the only scrolling region in `fill`. */}
      <div className={cn("border-t border-border pt-3", fill ? "mt-4 flex min-h-0 flex-1 flex-col" : "")}>
        <SectionLabel>Moods · days</SectionLabel>
        <div className={cn("-mx-1.5", fill && "min-h-[6rem] flex-1 overflow-y-auto")}>
          {ranked.map((m) => (
            <MoodRow key={m.value} mood={m} onOpen={() => setSelected({ kind: "mood", value: m.value })} />
          ))}
        </div>
      </div>

      {/* Weekly rhythm — kept, always in view, drillable; min-height keeps the strip whole. */}
      <button
        type="button"
        onClick={() => setSelected({ kind: "rhythm" })}
        className={cn("block w-full border-t border-border pt-3 text-left", fill ? "mt-3 shrink-0" : "")}
      >
        <div className="flex items-baseline justify-between">
          <SectionLabel>Weekly rhythm · avg mood</SectionLabel>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            best <b className="font-semibold text-foreground">{YEAR_INSIGHTS_WEEKDAYS[rhythm.bestWeekday]}</b>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </span>
        </div>
        <div className="mt-2 flex h-20 items-end gap-[3px]">
          {weekdayAvg.map((v, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-sm", v === null && "bg-muted-foreground/15")}
              style={v !== null ? { height: `${Math.max(12, ((v - lo) / span) * 100)}%`, backgroundColor: moodHex(moodByValue(moods, Math.round(v))) } : { height: "3px" }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex gap-[3px]">
          {WEEKDAY_INITIALS.map((l, i) => (
            <span key={i} className="flex-1 text-center text-[0.6rem] text-muted-foreground">{l}</span>
          ))}
        </div>
      </button>
    </div>
  );
}

/* ── Skeletons ───────────────────────────────────────────────────── */

export function ActivityYearInsightsSkeleton() {
  return (
    <aside className="hidden w-80 shrink-0 lg:block">
      <div className="rounded-xl border border-border bg-card p-4">
        <Skeleton className="mb-3 h-4 w-20" />
        {/* Total + sparkline */}
        <div className="flex items-end justify-between gap-3">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
        {/* Ranked activity rows */}
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          <Skeleton className="h-3 w-28" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-1 w-full rounded-full" />
            </div>
          ))}
        </div>
        {/* Sleep strip */}
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-full rounded-md" />
        </div>
      </div>
    </aside>
  );
}


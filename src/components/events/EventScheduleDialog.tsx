"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Bell, CalendarClock, Calendar as CalendarIcon, ChevronDown, Flag, Link2, Power, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefField } from "@/components/links/RefField";
import { useSubjectLabels } from "@/hooks/use-events";
import { toggleActive, updateEvent, type EventItem, type EventPriority } from "@/lib/events/events";
import type { EventSchedule } from "@/lib/events/schedule";
import { parseRefTokens, refKindAccentVar } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { PRIORITY_COLORS, PRIORITY_LEVELS } from "@/lib/tasks/tasks";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const days31 = Array.from({ length: 31 }, (_, i) => i + 1);

const ROW = "flex items-center gap-2.5 border-t border-border py-2.5 text-[13.5px]";
const ICON = "h-[15px] w-[15px] shrink-0 text-muted-foreground/70";
const MINI = "h-8 w-auto gap-1.5 rounded-lg border-border bg-transparent px-2.5 text-[13px]";

type FreqValue = EventSchedule["freq"] | "none";
const FREQS: Array<{ value: FreqValue; label: string }> = [
  { value: "none", label: "Log only" },
  { value: "interval", label: "Interval" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "once", label: "Once" },
];

/** Short cadence phrase for the collapsed summary line. */
function freqSummary(s: EventSchedule | null): string {
  if (!s) return "No schedule";
  switch (s.freq) {
    case "interval":
      return s.days === 1 ? "Every day" : `Every ${s.days} days`;
    case "weekly":
      return `Weekly · ${WEEKDAYS[s.weekday]}`;
    case "monthly":
      return `Monthly · day ${s.day}`;
    case "yearly":
      return `Yearly · ${MONTHS[s.month]} ${s.day}`;
    case "once":
      return `Once · ${format(new Date(`${s.date}T00:00:00`), "PP")}`;
  }
}

/**
 * The schedule builder for one event, in a calm dialog that mirrors the log
 * popup: hairline-divided rows, a collapsible "Repeats" summary, one violet
 * accent. Frequency + its parameter live behind the summary; the task lead-time,
 * priority, and pause rows only appear once a schedule exists. Writes are
 * immediate (each control persists on change).
 */
export function EventScheduleDialog({
  event,
  open,
  onOpenChange,
}: {
  event: EventItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const s = event.schedule;
  const [daysBefore, setDaysBefore] = useState(String(event.daysBefore));
  const [freqOpen, setFreqOpen] = useState(!s); // open when there's nothing to summarize yet
  const save = (next: EventSchedule | null) => void updateEvent(event.id, { schedule: next });

  const changeFreq = (freq: FreqValue) => {
    const today = new Date();
    switch (freq) {
      case "none":
        return save(null);
      case "interval":
        return save({ freq: "interval", days: 7 });
      case "once":
        return save({ freq: "once", date: format(today, "yyyy-MM-dd") });
      case "weekly":
        return save({ freq: "weekly", weekday: today.getDay() });
      case "monthly":
        return save({ freq: "monthly", day: today.getDate() });
      case "yearly":
        return save({ freq: "yearly", month: today.getMonth(), day: today.getDate() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="w-[22rem] max-w-[calc(100%-2rem)] gap-0 p-0">
        <DialogTitle className="sr-only">Schedule</DialogTitle>

        <div className="px-4 pb-1 pt-4">
          <div className="text-xs font-semibold text-muted-foreground/70">Schedule</div>

          {/* Frequency: a calm summary line that expands to pills + one parameter. */}
          <div>
            <button
              type="button"
              onClick={() => setFreqOpen((v) => !v)}
              aria-expanded={freqOpen}
              className={cn(ROW, "w-full text-left")}
            >
              <CalendarClock className={ICON} />
              <span className="min-w-0 flex-1">
                Repeats <span className="text-muted-foreground">· {freqSummary(s)}</span>
              </span>
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform", freqOpen && "rotate-180")} />
            </button>

            {freqOpen ? (
              <div className="pb-1">
                <div className="flex flex-wrap gap-1.5 pb-3 pt-0.5">
                  {FREQS.map((f) => {
                    const on = (s?.freq ?? "none") === f.value;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => changeFreq(f.value)}
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          on
                            ? "border-violet-500/35 bg-violet-500/15 text-violet-600 dark:text-violet-400"
                            : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                        )}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>

                {s ? <ParamControl schedule={s} onSave={save} /> : null}
              </div>
            ) : null}
          </div>

          {/* Task rows — only meaningful once a schedule can fire them. */}
          {s ? (
            <>
              <div className={ROW}>
                <Bell className={ICON} />
                <span className="flex items-center gap-1.5">
                  Add a task
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={daysBefore}
                    onChange={(e) => {
                      setDaysBefore(e.target.value);
                      void updateEvent(event.id, { daysBefore: clampDays(e.target.value) });
                    }}
                    aria-label="Days before due"
                    className="h-7 w-12 rounded-lg border border-border bg-transparent text-center text-[13px] tabular-nums text-foreground outline-none focus:border-violet-500"
                  />
                  days before
                </span>
              </div>

              <div className={ROW}>
                <Flag className={ICON} />
                <span>Priority</span>
                <Select value={event.priority} onValueChange={(v) => void updateEvent(event.id, { priority: v as EventPriority })}>
                  <SelectTrigger size="sm" className="ml-auto h-7 w-auto gap-1.5 border-0 bg-transparent px-1.5 text-[13px] capitalize shadow-none">
                    <span className={cn("inline-block h-2.5 w-2.5 rounded-full", PRIORITY_COLORS[event.priority].bg)} />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_LEVELS.map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className="flex items-center gap-2 capitalize">
                          <span className={cn("inline-block h-2.5 w-2.5 rounded-full", PRIORITY_COLORS[p].bg)} />
                          {p}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className={ROW}>
                <Power className={ICON} />
                <span className="min-w-0 flex-1">{event.active ? "Scheduling active" : "Scheduling paused"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={event.active}
                  aria-label={event.active ? "Pause scheduling" : "Resume scheduling"}
                  onClick={() => void toggleActive(event.id)}
                  className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
                    event.active ? "border-violet-500/35 bg-violet-500/15" : "border-border bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
                      event.active ? "left-[18px] bg-violet-500 dark:bg-violet-400" : "left-0.5 bg-muted-foreground/60",
                    )}
                  />
                </button>
              </div>
            </>
          ) : null}

          <SubjectRow event={event} />
        </div>

        <div className="flex items-center gap-2.5 border-t border-border px-4 py-3">
          <span className="text-[11.5px] text-muted-foreground/70">
            {s ? "Creates a task each cycle · saves as you go" : "Log only — records occurrences, no tasks"}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="ml-auto rounded-[10px] bg-violet-600 px-4 py-1.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 dark:bg-violet-500"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The single parameter control for the active frequency. */
function ParamControl({ schedule: s, onSave }: { schedule: EventSchedule; onSave: (next: EventSchedule) => void }) {
  const wrap = "flex flex-wrap items-center gap-2 pb-3 text-[13px] text-muted-foreground";
  if (s.freq === "interval") {
    return (
      <div className={wrap}>
        every
        <input
          type="number"
          min={1}
          max={365}
          value={s.days}
          onChange={(e) => onSave({ freq: "interval", days: Math.max(1, Math.min(365, Math.floor(Number(e.target.value)) || 1)) })}
          aria-label="Interval in days"
          className="h-8 w-14 rounded-lg border border-border bg-transparent text-center text-[13px] tabular-nums text-foreground outline-none focus:border-violet-500"
        />
        days
      </div>
    );
  }
  if (s.freq === "weekly") {
    return (
      <div className={wrap}>
        on
        <Select value={String(s.weekday)} onValueChange={(v) => onSave({ freq: "weekly", weekday: Number(v) })}>
          <SelectTrigger size="sm" className={MINI}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WEEKDAYS.map((name, i) => (
              <SelectItem key={i} value={String(i)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (s.freq === "monthly") {
    return (
      <div className={wrap}>
        on
        <Select value={String(s.day)} onValueChange={(v) => onSave({ freq: "monthly", day: Number(v) })}>
          <SelectTrigger size="sm" className={MINI}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days31.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Day {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (s.freq === "yearly") {
    return (
      <div className={wrap}>
        on
        <Select value={String(s.month)} onValueChange={(v) => onSave({ freq: "yearly", month: Number(v), day: s.day })}>
          <SelectTrigger size="sm" className={MINI}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((name, i) => (
              <SelectItem key={i} value={String(i)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(s.day)} onValueChange={(v) => onSave({ freq: "yearly", month: s.month, day: Number(v) })}>
          <SelectTrigger size="sm" className={MINI}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days31.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  return <OnceDate date={s.date} onPick={(date) => onSave({ freq: "once", date })} />;
}

/**
 * Optional "Tracks…" subject: link this event to another entity so its scheduled
 * logs land on that entity's timeline. Reuses `RefField`'s `[[` entity picker;
 * the first id-bound token becomes the subject. Clearing reverts to self.
 */
function SubjectRow({ event }: { event: EventItem }) {
  const [draft, setDraft] = useState("");
  const subjects = useMemo(
    () => (event.subjectId && event.subjectKind ? [{ id: event.subjectId, kind: event.subjectKind }] : []),
    [event.subjectId, event.subjectKind],
  );
  const labels = useSubjectLabels(subjects);

  if (event.subjectId && event.subjectKind) {
    const Icon = getApp(`${event.subjectKind}s`).icon;
    return (
      <div className={ROW}>
        <Link2 className={ICON} />
        <span>Tracks</span>
        <span className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2 py-1 text-[12.5px]">
          <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: refKindAccentVar(event.subjectKind) }} />
          <span className="min-w-0 truncate">{labels.get(event.subjectId) ?? "…"}</span>
          <button
            type="button"
            aria-label="Clear subject"
            onClick={() => void updateEvent(event.id, { subjectKind: null, subjectId: null })}
            className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={ROW}>
      <Link2 className={ICON} />
      <RefField
        value={draft}
        singleLine
        excludeId={event.id}
        ariaLabel="Event subject"
        placeholder="Track another thing…  type [["
        onChange={(v) => {
          const tok = parseRefTokens(v).find((t) => t.kind && t.id);
          if (tok?.kind && tok.id) {
            void updateEvent(event.id, { subjectKind: tok.kind, subjectId: tok.id });
            setDraft("");
          } else {
            setDraft(v);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

function OnceDate({ date, onPick }: { date: string; onPick: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 pb-3 text-[13px] text-muted-foreground">
      on
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[13px] text-foreground">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {format(new Date(`${date}T00:00:00`), "PP")}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={new Date(`${date}T00:00:00`)}
            onSelect={(d) => {
              if (d) onPick(format(d, "yyyy-MM-dd"));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function clampDays(value: string): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(60, n);
}

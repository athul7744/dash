"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Pause, Play, Tag as TagIcon, Trash2 } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LinkedFrom } from "@/components/links/LinkedFrom";
import { RefField } from "@/components/links/RefField";
import { SelectedTagPills } from "@/components/tags/SelectedTagPills";
import { TagSelector } from "@/components/tags/TagSelector";
import { useDebouncedSave } from "@/hooks/use-debounced-save";
import { reconcileEntityRefs } from "@/lib/links/links";
import {
  deleteReminder,
  toggleActive,
  updateReminder,
  type Reminder,
  type ReminderPriority,
} from "@/lib/reminders/reminders";
import { nextOccurrenceOnOrAfter, type ReminderSchedule } from "@/lib/reminders/schedule";
import { cn } from "@/lib/shared/utils";
import { PRIORITY_COLORS, PRIORITY_LEVELS } from "@/lib/tasks/tasks";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQS: Array<{ value: ReminderSchedule["freq"]; label: string }> = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const triggerCls = "h-7 w-auto gap-1 border-border/60 bg-transparent px-2 text-xs";

/**
 * A single editable reminder, inline like QuoteCard/TaskCard (no modal): title +
 * an inline schedule builder + lead time + priority + tags, all autosaving.
 * The title is locally controlled and debounced; the discrete pickers save
 * immediately. Remote changes reconcile only while the title isn't focused.
 */
export function ReminderCard({
  reminder,
  autoFocus = false,
}: {
  reminder: Reminder;
  autoFocus?: boolean;
}) {
  const [title, setTitle] = useState(reminder.title);
  const [daysBefore, setDaysBefore] = useState(String(reminder.daysBefore));
  const [dateOpen, setDateOpen] = useState(false);
  const { focusedRef, schedule, flush } = useDebouncedSave();

  // Reconcile remote (synced) changes only when this card isn't being edited.
  useEffect(() => {
    if (focusedRef.current) return;
    setTitle(reminder.title);
    setDaysBefore(String(reminder.daysBefore));
  }, [reminder.title, reminder.daysBefore, focusedRef]);

  const scheduleSave = (patch: Parameters<typeof updateReminder>[1]) =>
    schedule(() => void updateReminder(reminder.id, patch));

  const scheduleTitle = (next: string) =>
    schedule(() => {
      void updateReminder(reminder.id, { title: next });
      void reconcileEntityRefs(reminder.id, [next]);
    });

  const flushTitle = () =>
    flush(() => {
      void updateReminder(reminder.id, { title, daysBefore: clampDays(daysBefore) });
      void reconcileEntityRefs(reminder.id, [title]);
    });

  const saveSchedule = (schedule: ReminderSchedule) => void updateReminder(reminder.id, { schedule });

  const s = reminder.schedule;
  const today = new Date();
  const next = nextOccurrenceOnOrAfter(reminder.schedule, today);

  const changeFreq = (freq: ReminderSchedule["freq"]) => {
    switch (freq) {
      case "once":
        return saveSchedule({ freq: "once", date: format(today, "yyyy-MM-dd") });
      case "weekly":
        return saveSchedule({ freq: "weekly", weekday: today.getDay() });
      case "monthly":
        return saveSchedule({ freq: "monthly", day: today.getDate() });
      case "yearly":
        return saveSchedule({ freq: "yearly", month: today.getMonth(), day: today.getDate() });
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors focus-within:border-border sm:p-6",
        !reminder.active && "opacity-70",
      )}
    >
      <div className="absolute right-3 top-3 flex items-center gap-0.5">
        <TagSelector
          selectedTagIds={reminder.tags}
          onSelectedTagIdsChange={(ids) => void updateReminder(reminder.id, { tags: ids })}
          showSelectedTags={false}
          triggerContent={<TagIcon className="h-4 w-4" />}
          triggerClassName="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        />
        <IconButton
          label={reminder.active ? "Pause" : "Resume"}
          onClick={() => void toggleActive(reminder.id)}
        >
          {reminder.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconButton>
        <IconButton label="Delete" onClick={() => void deleteReminder(reminder.id)} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex items-start gap-2.5">
        {/* Priority as a compact colored-dot select. */}
        <Select
          value={reminder.priority}
          onValueChange={(v) => void updateReminder(reminder.id, { priority: v as ReminderPriority })}
        >
          <SelectTrigger
            size="sm"
            aria-label="Priority"
            className="mt-1 h-4 w-4 justify-center rounded-full border-none bg-transparent p-0 [&_svg]:hidden"
          >
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", PRIORITY_COLORS[reminder.priority].bg)} />
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

        <div className="min-w-0 flex-1 pr-14">
          <RefField
            value={title}
            autoFocus={autoFocus}
            singleLine
            excludeId={reminder.id}
            ariaLabel="Reminder title"
            placeholder="Task title…"
            onFocus={() => {
              focusedRef.current = true;
            }}
            onChange={(v) => {
              setTitle(v);
              scheduleTitle(v);
            }}
            onCommit={flushTitle}
            onBlur={flushTitle}
            className={cn(
              "w-full bg-transparent text-[15px] font-semibold text-card-foreground",
              !reminder.active && "line-through",
            )}
          />

          {/* Schedule builder */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Select value={s.freq} onValueChange={(v) => changeFreq(v as ReminderSchedule["freq"])}>
              <SelectTrigger size="sm" className={triggerCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {s.freq === "once" ? (
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-md border border-border/60 px-2 text-xs text-foreground",
                  )}
                >
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(new Date(`${s.date}T00:00:00`), "PP")}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={new Date(`${s.date}T00:00:00`)}
                    onSelect={(d) => {
                      if (d) saveSchedule({ freq: "once", date: format(d, "yyyy-MM-dd") });
                      setDateOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            ) : s.freq === "weekly" ? (
              <Select value={String(s.weekday)} onValueChange={(v) => saveSchedule({ freq: "weekly", weekday: Number(v) })}>
                <SelectTrigger size="sm" className={triggerCls}>
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
            ) : s.freq === "monthly" ? (
              <Select value={String(s.day)} onValueChange={(v) => saveSchedule({ freq: "monthly", day: Number(v) })}>
                <SelectTrigger size="sm" className={triggerCls}>
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
            ) : (
              <>
                <Select value={String(s.month)} onValueChange={(v) => saveSchedule({ freq: "yearly", month: Number(v), day: s.day })}>
                  <SelectTrigger size="sm" className={triggerCls}>
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
                <Select value={String(s.day)} onValueChange={(v) => saveSchedule({ freq: "yearly", month: s.month, day: Number(v) })}>
                  <SelectTrigger size="sm" className={triggerCls}>
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
              </>
            )}
          </div>

          {/* Lead time */}
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Add task</span>
            <input
              type="number"
              min={0}
              max={60}
              value={daysBefore}
              onFocus={() => {
                focusedRef.current = true;
              }}
              onChange={(e) => {
                setDaysBefore(e.target.value);
                scheduleSave({ daysBefore: clampDays(e.target.value) });
              }}
              onBlur={flushTitle}
              className="h-7 w-12 rounded-md border border-border/60 bg-transparent px-2 text-center text-xs text-foreground outline-none"
            />
            <span>day{clampDays(daysBefore) === 1 ? "" : "s"} before</span>
          </div>

          <SelectedTagPills tagIds={reminder.tags} className="mt-3" />

          <LinkedFrom targetId={reminder.id} className="mt-3" />

          <p className="mt-3 text-xs text-muted-foreground/70">
            {reminder.active ? (next ? `Next task on ${format(next, "PP")}` : "No upcoming occurrence") : "Paused"}
          </p>
        </div>
      </div>
    </div>
  );
}

const days31 = Array.from({ length: 31 }, (_, i) => i + 1);

function clampDays(value: string): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(60, n);
}

function IconButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

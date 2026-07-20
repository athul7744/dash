"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagSelector } from "@/components/tags/TagSelector";
import {
  createReminder,
  updateReminder,
  type Reminder,
  type ReminderPriority,
} from "@/lib/reminders/reminders";
import type { ReminderSchedule } from "@/lib/reminders/schedule";
import { cn } from "@/lib/shared/utils";
import { PRIORITY_COLORS, PRIORITY_LEVELS } from "@/lib/tasks/tasks";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FREQS: Array<{ value: ReminderSchedule["freq"]; label: string }> = [
  { value: "once", label: "One-off" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

interface FormState {
  title: string;
  link: string;
  tags: string[];
  priority: ReminderPriority;
  daysBefore: number;
  freq: ReminderSchedule["freq"];
  onceDate: Date | undefined;
  weekday: number;
  monthDay: number;
  yearMonth: number;
  yearDay: number;
}

function blankState(): FormState {
  const today = new Date();
  return {
    title: "",
    link: "",
    tags: [],
    priority: "medium",
    daysBefore: 3,
    freq: "monthly",
    onceDate: undefined,
    weekday: today.getDay(),
    monthDay: today.getDate(),
    yearMonth: today.getMonth(),
    yearDay: today.getDate(),
  };
}

/** Decompose an existing reminder into the flat form fields. */
function stateFromReminder(r: Reminder): FormState {
  const base = blankState();
  const s = r.schedule;
  return {
    ...base,
    title: r.title,
    link: r.link,
    tags: r.tags,
    priority: r.priority,
    daysBefore: r.daysBefore,
    freq: s.freq,
    onceDate: s.freq === "once" ? new Date(`${s.date}T00:00:00`) : undefined,
    weekday: s.freq === "weekly" ? s.weekday : base.weekday,
    monthDay: s.freq === "monthly" ? s.day : base.monthDay,
    yearMonth: s.freq === "yearly" ? s.month : base.yearMonth,
    yearDay: s.freq === "yearly" ? s.day : base.yearDay,
  };
}

function buildSchedule(f: FormState): ReminderSchedule | null {
  switch (f.freq) {
    case "once":
      return f.onceDate ? { freq: "once", date: format(f.onceDate, "yyyy-MM-dd") } : null;
    case "weekly":
      return { freq: "weekly", weekday: f.weekday };
    case "monthly":
      return { freq: "monthly", day: f.monthDay };
    case "yearly":
      return { freq: "yearly", month: f.yearMonth, day: f.yearDay };
  }
}

interface ReminderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits this reminder; otherwise it creates a new one. */
  reminder?: Reminder | null;
}

export function ReminderForm({ open, onOpenChange, reminder }: ReminderFormProps) {
  const [form, setForm] = useState<FormState>(blankState);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed the fields each time the dialog opens (render-time, no effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(reminder ? stateFromReminder(reminder) : blankState());
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const schedule = buildSchedule(form);
  const canSave = form.title.trim().length > 0 && schedule !== null && !saving;

  const save = async () => {
    if (!schedule || !form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        link: form.link,
        tags: form.tags,
        priority: form.priority,
        schedule,
        daysBefore: form.daysBefore,
      };
      if (reminder) {
        await updateReminder(reminder.id, payload);
      } else {
        await createReminder(payload);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reminder-title">Task title</Label>
            <Input
              id="reminder-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Pay rent"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reminder-link">Link (optional)</Label>
            <Input
              id="reminder-link"
              value={form.link}
              onChange={(e) => set("link", e.target.value)}
              placeholder="https://…"
            />
          </div>

          {/* Schedule builder */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Repeats</Label>
              <Select value={form.freq} onValueChange={(v) => set("freq", v as ReminderSchedule["freq"])}>
                <SelectTrigger>
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
            </div>

            <div className="space-y-1.5">
              <Label>On</Label>
              {form.freq === "once" ? (
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger
                    className={cn(
                      "flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-sm",
                      !form.onceDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {form.onceDate ? format(form.onceDate, "PP") : "Pick a date"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={form.onceDate}
                      onSelect={(d) => {
                        set("onceDate", d);
                        setDateOpen(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              ) : form.freq === "weekly" ? (
                <Select value={String(form.weekday)} onValueChange={(v) => set("weekday", Number(v))}>
                  <SelectTrigger>
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
              ) : form.freq === "monthly" ? (
                <Select value={String(form.monthDay)} onValueChange={(v) => set("monthDay", Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Day {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Select value={String(form.yearMonth)} onValueChange={(v) => set("yearMonth", Number(v))}>
                    <SelectTrigger>
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
                  <Select value={String(form.yearDay)} onValueChange={(v) => set("yearDay", Number(v))}>
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-lead">Add task … days before</Label>
              <Input
                id="reminder-lead"
                type="number"
                min={0}
                max={60}
                value={form.daysBefore}
                onChange={(e) => set("daysBefore", Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v as ReminderPriority)}>
                <SelectTrigger>
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
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagSelector selectedTagIds={form.tags} onSelectedTagIdsChange={(ids) => set("tags", ids)} />
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canSave}
            className="inline-flex h-9 items-center rounded-md bg-violet-600 px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-violet-500"
          >
            {reminder ? "Save" : "Create reminder"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

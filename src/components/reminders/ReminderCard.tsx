"use client";

import { format } from "date-fns";
import { Pause, Pencil, Play, Trash2 } from "lucide-react";

import { deleteReminder, toggleActive, type Reminder } from "@/lib/reminders/reminders";
import { formatSchedule, nextOccurrenceOnOrAfter } from "@/lib/reminders/schedule";
import type { Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";
import { getTagColorClasses } from "@/lib/tasks/colors";
import { PRIORITY_COLORS } from "@/lib/tasks/tasks";

interface ReminderCardProps {
  reminder: Reminder;
  allTags: Tag[];
  onEdit: (reminder: Reminder) => void;
}

export function ReminderCard({ reminder, allTags, onEdit }: ReminderCardProps) {
  const next = nextOccurrenceOnOrAfter(reminder.schedule, new Date());
  const tags = allTags.filter((t) => reminder.tags.includes(t.id));
  const lead = reminder.daysBefore === 0 ? "same day" : `${reminder.daysBefore} day${reminder.daysBefore === 1 ? "" : "s"} before`;

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/65 bg-card/60 p-5 transition-colors sm:p-6",
        !reminder.active && "opacity-60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full", PRIORITY_COLORS[reminder.priority].bg)}
          title={`${reminder.priority} priority`}
        />

        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[15px] font-semibold text-card-foreground", !reminder.active && "line-through")}>
            {reminder.title || "Untitled"}
          </h3>

          <p className="mt-1 text-sm text-muted-foreground">
            {formatSchedule(reminder.schedule)}
            <span className="text-muted-foreground/60"> · adds {lead}</span>
          </p>

          <p className="mt-1 text-xs text-muted-foreground/70">
            {reminder.active
              ? next
                ? `Next task on ${format(next, "PP")}`
                : "No upcoming occurrence"
              : "Paused"}
          </p>

          {tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium",
                    getTagColorClasses(tag.color || "slate"),
                  )}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton label="Edit" onClick={() => onEdit(reminder)}>
            <Pencil className="h-4 w-4" />
          </IconButton>
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
      </div>
    </div>
  );
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
        danger ? "hover:text-red-600 dark:hover:text-red-400" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

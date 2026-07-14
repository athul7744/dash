"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, NotebookPen, type LucideIcon } from "lucide-react";

import type { Task } from "@/lib/powersync/AppSchema";
import { getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";

import { TaskPopup } from "./TaskPopup";

type TaskRow = Task & { id: string };
/** The nudge kinds HeroAction renders (mood variants are handled by the hero). */
type ActionKind = "task" | "plan" | "track" | "journal";

const TASKS = getApp("tasks");
const TRACKER = getApp("tracker");
const NOTES = getApp("notes");

function scrollToId(id: string, focusSelector?: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (focusSelector) {
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(focusSelector)?.focus();
    }, 450);
  }
}

function config(kind: ActionKind, topTask: TaskRow | null): {
  icon: LucideIcon;
  iconBg: string;
  iconText: string;
  label: string;
  sub: string | null;
} {
  switch (kind) {
    case "task":
      return { icon: TASKS.icon, iconBg: TASKS.accent.iconBg, iconText: TASKS.accent.iconText, label: "Do this next", sub: topTask?.title || "Untitled task" };
    case "plan":
      return { icon: TASKS.icon, iconBg: TASKS.accent.iconBg, iconText: TASKS.accent.iconText, label: "Plan your day", sub: null };
    case "track":
      return { icon: TRACKER.icon, iconBg: TRACKER.accent.iconBg, iconText: TRACKER.accent.iconText, label: "Log your time", sub: null };
    case "journal":
      return { icon: NotebookPen, iconBg: NOTES.accent.iconBg, iconText: NOTES.accent.iconText, label: "Reflect on your day", sub: null };
  }
}

/**
 * The hero's contextual nudge (everything except mood, which the hero renders
 * as the picker). Tapping opens the most-relevant task, scrolls to the matching
 * dashboard section, or navigates to the app.
 */
export function HeroAction({ kind, topTask }: { kind: ActionKind; topTask: TaskRow | null }) {
  const router = useRouter();
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const { icon: Icon, iconBg, iconText, label, sub } = config(kind, topTask);

  const handleClick = () => {
    switch (kind) {
      case "task":
        if (topTask) setOpenTask(topTask);
        else scrollToId("today-tasks");
        break;
      case "plan":
        scrollToId("today-tasks", "#dashboard-quick-add");
        break;
      case "track":
        router.push("/tracker");
        break;
      case "journal":
        scrollToId("weekly-journal");
        break;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="group flex items-center gap-2.5 text-left"
      >
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", iconBg)}>
          <Icon className={cn("h-4 w-4", iconText)} />
        </span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="font-heading text-sm font-semibold text-foreground">{label}</span>
          {sub ? <span className="max-w-[16rem] truncate font-serif text-xs text-muted-foreground">{sub}</span> : null}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </button>

      <TaskPopup task={openTask} onOpenChange={(next) => { if (!next) setOpenTask(null); }} />
    </>
  );
}

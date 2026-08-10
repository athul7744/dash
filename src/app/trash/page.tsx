"use client";

import { useState } from "react";
import { Bookmark, CalendarClock, FileText, ListTodo, Quote as QuoteIcon, RotateCcw, Trash2, type LucideIcon } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { MobileBottomFabs } from "@/components/MobileBottomFabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";
import { useTrashedItems, type TrashedItem } from "@/hooks/use-trash";
import { restoreEntity, purgeEntity, type TrashKind } from "@/lib/shared/trash";
import { HEADER_ACTION_BASE, type AppConfig } from "@/lib/shared/apps";
import { cn, formatRelativeTime } from "@/lib/shared/utils";

// A synthetic app config so the shared AppHeader can render a Trash identity
// (Trash isn't a real app — it's a cross-app destination, like Graph).
const trashApp: AppConfig = {
  id: "trash",
  name: "Trash",
  description: "Restore or permanently delete removed items",
  href: "/trash",
  icon: Trash2,
  accent: {
    iconBg: "bg-slate-500/10 dark:bg-slate-500/20",
    iconText: "text-slate-600 dark:text-slate-400",
    hoverText: "hover:text-slate-700 dark:hover:text-slate-300",
  },
};

const KIND_META: Record<TrashKind, { label: string; icon: LucideIcon; accent: string }> = {
  task: { label: "Task", icon: ListTodo, accent: "text-indigo-600 dark:text-indigo-400" },
  note: { label: "Note", icon: FileText, accent: "text-amber-700 dark:text-amber-400" },
  bookmark: { label: "Bookmark", icon: Bookmark, accent: "text-sky-600 dark:text-sky-400" },
  quote: { label: "Quote", icon: QuoteIcon, accent: "text-rose-600 dark:text-rose-400" },
  event: { label: "Event", icon: CalendarClock, accent: "text-emerald-600 dark:text-emerald-400" },
};

function TrashRow({ item }: { item: TrashedItem }) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3 transition-colors hover:border-border">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/50">
        <Icon className={cn("h-4.5 w-4.5", meta.accent)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {meta.label}
          {item.updatedAt ? ` · ${formatRelativeTime(new Date(item.updatedAt))}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void restoreEntity(item.kind, item.id)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Restore
      </button>
      <button
        type="button"
        onClick={() => void purgeEntity(item.kind, item.id)}
        aria-label="Delete permanently"
        title="Delete permanently"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function TrashRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 px-4 py-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-20 rounded-full" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
    </div>
  );
}

export default function TrashPage() {
  const { items, isLoading } = useTrashedItems();
  const [emptying, setEmptying] = useState(false);
  const [restoringAll, setRestoringAll] = useState(false);
  const busy = emptying || restoringAll;

  const emptyTrash = async () => {
    setEmptying(true);
    try {
      // Snapshot first — purging mutates the reactive list underneath us.
      for (const item of [...items]) await purgeEntity(item.kind, item.id);
    } finally {
      setEmptying(false);
    }
  };

  const restoreAll = async () => {
    setRestoringAll(true);
    try {
      for (const item of [...items]) await restoreEntity(item.kind, item.id);
    } finally {
      setRestoringAll(false);
    }
  };

  return (
    <>
      <AppHeader
        app={trashApp}
        actions={
          items.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => void restoreAll()}
                disabled={busy}
                className={cn(HEADER_ACTION_BASE, "hover:text-foreground disabled:opacity-50")}
              >
                <RotateCcw className="h-4 w-4" />
                {restoringAll ? "Restoring…" : "Restore all"}
              </button>
              <AlertDialog>
                <AlertDialogTrigger disabled={busy} className={cn(HEADER_ACTION_BASE, "hover:text-destructive disabled:opacity-50")}>
                  <Trash2 className="h-4 w-4" />
                  Delete all
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all items?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanently deletes all {items.length} item{items.length === 1 ? "" : "s"} in the Trash. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={emptying}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void emptyTrash()}
                      disabled={emptying}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {emptying ? "Deleting…" : "Delete all"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : undefined
        }
      />

      <div className="skeleton-settle-in mx-auto max-w-3xl px-[var(--app-gutter-x)] py-8 pb-40">
        {isLoading ? (
          <SkeletonWave className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <TrashRowSkeleton key={i} />
            ))}
          </SkeletonWave>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted/50">
              <Trash2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-lg font-semibold tracking-tight">Trash is empty</p>
              <p className="text-sm text-muted-foreground">Deleted items land here, and you can restore them anytime.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((item) => (
              <TrashRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <MobileBottomFabs app={trashApp} />
    </>
  );
}

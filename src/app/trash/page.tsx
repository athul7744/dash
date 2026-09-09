"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  CalendarClock,
  CheckSquare,
  FileText,
  ListTodo,
  Quote as QuoteIcon,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react";

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
} from "@/components/ui/alert-dialog";
import { Skeleton, SkeletonWave } from "@/components/ui/skeleton";
import { useTrashedItems, type TrashedItem } from "@/hooks/use-trash";
import { purgeEntities, restoreEntities, restoreEntity, purgeEntity, type TrashKind } from "@/lib/shared/trash";
import { type AppConfig } from "@/lib/shared/apps";
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

const TOOLBAR_BUTTON = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50";

function TrashRow({
  item,
  selecting,
  checked,
  onToggle,
}: {
  item: TrashedItem;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = KIND_META[item.kind];
  const Icon = meta.icon;

  const body = (
    <>
      {selecting ? (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${item.label}`}
          className="h-4 w-4 shrink-0 accent-violet-500"
        />
      ) : null}
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
    </>
  );

  const frame = cn(
    "group flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 transition-colors",
    checked ? "border-violet-500/60 bg-violet-500/5" : "border-border/60 hover:border-border",
  );

  // While selecting, the row is one big tap target and the per-row actions are
  // gone: choosing and acting on a single item are different jobs, and a button
  // inside a label fires the label too.
  if (selecting) {
    return (
      <label className={cn(frame, "cursor-pointer")}>
        {body}
      </label>
    );
  }

  return (
    <div className={frame}>
      {body}
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
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  /** Which set the open confirmation is about. */
  const [confirming, setConfirming] = useState<"all" | "selected" | null>(null);
  const [busy, setBusy] = useState<"restore" | "delete" | null>(null);

  // Read the selection off the live list, so an item restored or purged from
  // another device drops out of it rather than being acted on twice.
  const selected = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds]);
  const targets = confirming === "selected" ? selected : items;

  const stopSelecting = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runRestore = async (list: TrashedItem[]) => {
    setBusy("restore");
    try {
      // A snapshot: the reactive list empties underneath as each one lands.
      await restoreEntities([...list]);
      stopSelecting();
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async () => {
    setBusy("delete");
    try {
      await purgeEntities([...targets]);
      stopSelecting();
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <>
      <AppHeader app={trashApp} />

      <div className="skeleton-settle-in mx-auto max-w-3xl px-[var(--app-gutter-x)] py-8 pb-40">
        {/* One toolbar for every width — these actions were unreachable on a
            phone while they lived in the desktop-only header row. */}
        {!isLoading && items.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selecting
                ? `${selected.length} of ${items.length} selected`
                : `${items.length} item${items.length === 1 ? "" : "s"}`}
            </span>

            <div className="flex flex-wrap items-center gap-1">
              {selecting ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        selected.length === items.length ? new Set() : new Set(items.map((item) => item.id)),
                      )
                    }
                    className={cn(TOOLBAR_BUTTON, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    {selected.length === items.length ? "Select none" : "Select all"}
                  </button>
                  <button
                    type="button"
                    disabled={selected.length === 0 || busy !== null}
                    onClick={() => void runRestore(selected)}
                    className={cn(TOOLBAR_BUTTON, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {busy === "restore" ? "Restoring…" : "Restore"}
                  </button>
                  <button
                    type="button"
                    disabled={selected.length === 0 || busy !== null}
                    onClick={() => setConfirming("selected")}
                    className={cn(TOOLBAR_BUTTON, "text-destructive hover:bg-destructive/10")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={stopSelecting}
                    className={cn(TOOLBAR_BUTTON, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSelecting(true)}
                    className={cn(TOOLBAR_BUTTON, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    Select
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void runRestore(items)}
                    className={cn(TOOLBAR_BUTTON, "text-muted-foreground hover:bg-accent hover:text-foreground")}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {busy === "restore" ? "Restoring…" : "Restore all"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirming("all")}
                    className={cn(TOOLBAR_BUTTON, "text-destructive hover:bg-destructive/10")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete all
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

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
              <TrashRow
                key={item.id}
                item={item}
                selecting={selecting}
                checked={selectedIds.has(item.id)}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controlled and rendered here rather than under a trigger, so the same
          dialog serves both "delete all" and "delete selected". */}
      <AlertDialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "selected" ? "Delete selected items?" : "Delete all items?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes {targets.length} item{targets.length === 1 ? "" : "s"}
              {confirming === "selected" ? " from the Trash" : " in the Trash"}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void runDelete()}
              disabled={busy === "delete"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy === "delete" ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileBottomFabs app={trashApp} />
    </>
  );
}

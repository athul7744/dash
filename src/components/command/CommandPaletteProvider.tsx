"use client";

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@powersync/react";
import { Plus, Zap } from "lucide-react";

import { PageIcon } from "@/components/notes/page/ui";
import { useNotesPageDerivedState } from "@/components/notes/page/useNotesPageDerivedState";
import { CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { SearchPopup } from "@/components/ui/search-popup";
import { EntityPopup, type EntityRef } from "@/components/command/EntityPopup";
import { useCapture } from "@/components/capture/CaptureProvider";
import { useAllNotePages } from "@/hooks/use-notes";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useQuotes } from "@/hooks/use-quotes";
import { useReminders } from "@/hooks/use-reminders";
import type { Task } from "@/lib/powersync/AppSchema";
import { APPS, getApp } from "@/lib/shared/apps";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo, getLinkHost } from "@/lib/tasks/tasks";

type TaskRow = Task & { id: string };
const MAX_RESULTS = 6;

/** Apps that support creating a single item from the palette (tracker doesn't). */
const CREATE_APPS = ["tasks", "notes", "bookmarks", "quotes", "reminders"] as const;
const SINGULAR: Record<string, string> = {
  tasks: "task",
  notes: "note",
  bookmarks: "bookmark",
  quotes: "quote",
  reminders: "reminder",
};

const CommandContext = createContext<() => void>(() => {});

/** Open the global command palette from anywhere under <CommandPaletteProvider>. */
export const useCommandPalette = () => useContext(CommandContext);

/**
 * Mounts the command palette once, app-wide, and registers ⌘/Ctrl+K. Searches
 * all five entities and runs navigation / create / capture commands. Modeled on
 * CaptureProvider; must live under it (uses useCapture) inside PowerSyncProvider.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const openCapture = useCapture();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<EntityRef | null>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  // Global ⌘/Ctrl+K. No typing-guard: a palette should open even mid-edit
  // (matches the previous GlobalSearch behavior, which this replaces).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette]);

  const navigate = useCallback(
    (href: string) => {
      handleOpenChange(false);
      router.push(href);
    },
    [handleOpenChange, router],
  );

  const selectEntity = useCallback(
    (ref: EntityRef) => {
      handleOpenChange(false);
      setSelected(ref);
    },
    [handleOpenChange],
  );

  const runCapture = useCallback(() => {
    handleOpenChange(false);
    openCapture();
  }, [handleOpenChange, openCapture]);

  return (
    <CommandContext.Provider value={openPalette}>
      {children}

      <SearchPopup
        open={open}
        onOpenChange={handleOpenChange}
        title="Command palette"
        description="Search everything and jump to any app."
        placeholder="Search or run a command…"
        query={query}
        onQueryChange={setQuery}
      >
        {open ? (
          <CommandPaletteResults
            query={query}
            onNavigate={navigate}
            onSelectEntity={selectEntity}
            onCapture={runCapture}
          />
        ) : null}
      </SearchPopup>

      <EntityPopup item={selected} onOpenChange={(next) => { if (!next) setSelected(null); }} />
    </CommandContext.Provider>
  );
}

/** Small app-accent chip for an entity result's leading icon. */
function AppChip({ appId }: { appId: string }) {
  const app = getApp(appId);
  const Icon = app.icon;
  return (
    <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", app.accent.iconBg)}>
      <Icon className={cn("h-3.5 w-3.5", app.accent.iconText)} />
    </span>
  );
}

/**
 * The palette body — only mounted while the palette is open, so the five
 * reactive queries stay idle otherwise. Caller filters (cmdk shouldFilter is off).
 */
function CommandPaletteResults({
  query,
  onNavigate,
  onSelectEntity,
  onCapture,
}: {
  query: string;
  onNavigate: (href: string) => void;
  onSelectEntity: (ref: EntityRef) => void;
  onCapture: () => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const q = deferredQuery.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // --- Entity data (reuses each app's existing hooks) ---
  const { data: allTasks = [] } = useQuery<TaskRow>(
    "SELECT * FROM tasks WHERE state != 'trashed' AND parent_id IS NULL ORDER BY updated_at DESC",
  );
  const { pages } = useAllNotePages();
  const { filteredSearchPages } = useNotesPageDerivedState({
    allPages: pages,
    recentPages: pages,
    pageSearchQuery: deferredQuery,
  });
  const { bookmarks } = useBookmarks();
  const { quotes } = useQuotes();
  const { reminders } = useReminders();

  // --- Commands ---
  const matchCmd = (label: string) => !hasQuery || label.toLowerCase().includes(q);
  const actionCmds = useMemo(
    () => [{ key: "capture", label: "Quick capture", run: onCapture }].filter((c) => matchCmd(c.label)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, onCapture],
  );
  const navCmds = useMemo(
    () => APPS.filter((app) => matchCmd(`Go to ${app.name}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q],
  );
  const createCmds = useMemo(
    () => CREATE_APPS.map((id) => getApp(id)).filter((app) => matchCmd(`New ${SINGULAR[app.id]}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q],
  );

  // --- Entity results (only when searching) ---
  const tasks = hasQuery
    ? allTasks.filter((t) => (t.title ?? "").toLowerCase().includes(q)).slice(0, MAX_RESULTS)
    : [];
  const notes = hasQuery ? filteredSearchPages.slice(0, MAX_RESULTS) : [];
  const bookmarkHits = useMemo(() => {
    if (!hasQuery) return [];
    return bookmarks
      .filter((b) => `${b.title} ${b.note} ${b.url} ${getLinkHost(b.url) ?? ""} ${b.tags.join(" ")}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [bookmarks, q, hasQuery]);
  const quoteHits = useMemo(() => {
    if (!hasQuery) return [];
    return quotes.filter((qt) => `${qt.text} ${qt.author}`.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [quotes, q, hasQuery]);
  const reminderHits = useMemo(() => {
    if (!hasQuery) return [];
    return reminders
      .filter((r) => `${r.title} ${r.tags.join(" ")}`.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [reminders, q, hasQuery]);

  const nothing =
    actionCmds.length === 0 &&
    navCmds.length === 0 &&
    createCmds.length === 0 &&
    tasks.length === 0 &&
    notes.length === 0 &&
    bookmarkHits.length === 0 &&
    quoteHits.length === 0 &&
    reminderHits.length === 0;

  return (
    <>
      {nothing ? <CommandEmpty>No matches found.</CommandEmpty> : null}

      {actionCmds.length > 0 ? (
        <CommandGroup heading="Actions">
          {actionCmds.map((c) => (
            <CommandItem key={c.key} value={`action:${c.key}`} onSelect={c.run} className="items-center gap-3 rounded-lg px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.label}</span>
              <CommandShortcut>⌘I</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {navCmds.length > 0 ? (
        <CommandGroup heading="Go to">
          {navCmds.map((app) => {
            const Icon = app.icon;
            return (
              <CommandItem
                key={`nav:${app.id}`}
                value={`nav:${app.id}`}
                onSelect={() => onNavigate(app.href)}
                className="items-center gap-3 rounded-lg px-3 py-2"
              >
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", app.accent.iconBg)}>
                  <Icon className={cn("h-3.5 w-3.5", app.accent.iconText)} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{app.name}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}

      {createCmds.length > 0 ? (
        <CommandGroup heading="Create">
          {createCmds.map((app) => (
            <CommandItem
              key={`new:${app.id}`}
              value={`new:${app.id}`}
              onSelect={() => onNavigate(`${app.href}?new=1`)}
              className="items-center gap-3 rounded-lg px-3 py-2"
            >
              <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", app.accent.iconBg)}>
                <Plus className={cn("h-3.5 w-3.5", app.accent.iconText)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">New {SINGULAR[app.id]}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {tasks.length > 0 ? (
        <CommandGroup heading="Tasks">
          {tasks.map((task) => {
            const info = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined);
            const showChip = info.show && (info.label === "Overdue" || info.label === "Due Today");
            return (
              <CommandItem
                key={task.id}
                value={`task:${task.id}`}
                onSelect={() => onSelectEntity({ kind: "task", id: task.id })}
                className="items-center gap-3 rounded-lg px-3 py-2"
              >
                <AppChip appId="tasks" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{task.title || "Untitled task"}</span>
                {showChip ? (
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px]", info.bg, info.text)}>{info.label}</span>
                ) : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      ) : null}

      {notes.length > 0 ? (
        <CommandGroup heading="Notes">
          {notes.map((page) => (
            <CommandItem
              key={page.id}
              value={`note:${page.id}`}
              onSelect={() => onNavigate(`/notes?page=${page.id}`)}
              className="items-start gap-3 rounded-lg px-3 py-2"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <PageIcon emoji={page.emoji} className="h-4 w-4 text-base leading-none" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{page.title || "Untitled page"}</div>
                {page.summary ? <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{page.summary}</div> : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {bookmarkHits.length > 0 ? (
        <CommandGroup heading="Bookmarks">
          {bookmarkHits.map((b) => (
            <CommandItem
              key={b.id}
              value={`bookmark:${b.id}`}
              onSelect={() => onSelectEntity({ kind: "bookmark", id: b.id })}
              className="items-start gap-3 rounded-lg px-3 py-2"
            >
              <AppChip appId="bookmarks" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{b.title || getLinkHost(b.url) || b.url || "Untitled"}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{getLinkHost(b.url) || b.url}</div>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {quoteHits.length > 0 ? (
        <CommandGroup heading="Quotes">
          {quoteHits.map((qt) => (
            <CommandItem
              key={qt.id}
              value={`quote:${qt.id}`}
              onSelect={() => onSelectEntity({ kind: "quote", id: qt.id })}
              className="items-start gap-3 rounded-lg px-3 py-2"
            >
              <AppChip appId="quotes" />
              <div className="min-w-0 flex-1">
                <div className="line-clamp-1 text-sm text-foreground">{qt.text || "Untitled quote"}</div>
                {qt.author ? <div className="mt-0.5 truncate text-xs text-muted-foreground">— {qt.author}</div> : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {reminderHits.length > 0 ? (
        <CommandGroup heading="Reminders">
          {reminderHits.map((r) => (
            <CommandItem
              key={r.id}
              value={`reminder:${r.id}`}
              onSelect={() => onSelectEntity({ kind: "reminder", id: r.id })}
              className="items-center gap-3 rounded-lg px-3 py-2"
            >
              <AppChip appId="reminders" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.title || "Untitled reminder"}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}

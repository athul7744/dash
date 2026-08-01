"use client";

import {
  createContext,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@powersync/react";
import { Plus, X, Zap } from "lucide-react";

import { useSearchIndexReady } from "@/hooks/use-search-index";
import { searchEntities, type SearchHit } from "@/lib/search/query";
import { parseSearchQuery, toHighlightSegments } from "@/lib/search/match-query";

import { PageIcon } from "@/components/notes/page/ui";
import { useNotesPageDerivedState } from "@/components/notes/page/useNotesPageDerivedState";
import { CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from "@/components/ui/command";
import { SearchPopup } from "@/components/ui/search-popup";
import { EntityPopup, type EntityRef } from "@/components/command/EntityPopup";
import { OPEN_ENTITY_EVENT, type OpenEntityDetail } from "@/components/links/EntityRefNode";
import { useCapture } from "@/components/capture/CaptureProvider";
import { useAllNotePages } from "@/hooks/use-notes";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useQuotes } from "@/hooks/use-quotes";
import { useEvents } from "@/hooks/use-events";
import type { Task } from "@/lib/powersync/AppSchema";
import { APPS, getApp } from "@/lib/shared/apps";
import { stripRefs } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo, getLinkHost } from "@/lib/tasks/tasks";

type TaskRow = Task & { id: string };
const MAX_RESULTS = 8;

/** `kind:` filter options — shown as clickable chips to teach + apply the syntax. */
const KIND_OPTIONS = [
  { kind: "note", appId: "notes", label: "Notes" },
  { kind: "task", appId: "tasks", label: "Tasks" },
  { kind: "bookmark", appId: "bookmarks", label: "Bookmarks" },
  { kind: "quote", appId: "quotes", label: "Quotes" },
  { kind: "event", appId: "events", label: "Events" },
] as const;

/** Matches a `kind:`/`type:`/`k:` token being typed at the end of the query. */
const KIND_TOKEN_RE = /(?:^|\s)(?:kind|type|k):(\w*)$/i;

/** Aliases accepted as a committed filter chip (canonical kind on the right). */
const CHIP_KIND_ALIASES: Record<string, string> = {
  note: "note", notes: "note",
  task: "task", tasks: "task", todo: "task", todos: "task",
  bookmark: "bookmark", bookmarks: "bookmark", link: "bookmark", links: "bookmark",
  quote: "quote", quotes: "quote",
  event: "event", events: "event",
};

/**
 * A *committed* `kind:<valid> ` prefix (valid kind followed by a space) → the
 * chip's canonical kind + the trailing search terms. Returns null while the kind
 * is still being typed (no trailing space) so completion can keep working.
 */
function parseKindChip(q: string): { kind: string; terms: string } | null {
  const m = q.match(/^(?:kind|type|k):([a-z]+)\s([\s\S]*)$/i);
  if (!m) return null;
  const kind = CHIP_KIND_ALIASES[m[1].toLowerCase()];
  return kind ? { kind, terms: m[2] } : null;
}

/** Apps that support creating a single item from the palette (tracker doesn't). */
const CREATE_APPS = ["tasks", "notes", "bookmarks", "quotes", "events"] as const;
const SINGULAR: Record<string, string> = {
  tasks: "task",
  notes: "note",
  bookmarks: "bookmark",
  quotes: "quote",
  events: "event",
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
  // While true, a committed kind chip is "opened" back into editable text so its
  // value can be deleted char-by-char (see the input backspace handler below).
  const [editingKind, setEditingKind] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  const openPalette = useCallback(() => {
    setQuery("");
    setEditingKind(false);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setEditingKind(false);
    }
  }, []);

  // Programmatic query set (chip clicks, kind completion) always reforms chips.
  const setQueryExternal = useCallback((q: string) => {
    setEditingKind(false);
    setQuery(q);
  }, []);

  // The active kind chip and the text shown in the input (terms only when chipped).
  const chip = editingKind ? null : parseKindChip(query);
  const inputValue = chip ? chip.terms : query;

  const handleInputChange = (val: string) => {
    if (chip) {
      // One kind chip is already active — strip any further kind: token from the
      // terms so a second chip can't form (switch kinds via the chip/group instead).
      const cleaned = val.replace(/(?:^|\s)(?:kind|type|k):[a-z]*/gi, " ").replace(/\s+/g, " ").trimStart();
      setQuery(`kind:${chip.kind} ${cleaned}`);
    } else {
      if (editingKind && !/^(?:kind|type|k):/i.test(val)) setEditingKind(false);
      setQuery(val);
    }
  };

  const removeChip = () => {
    setEditingKind(false);
    setQuery(chip ? chip.terms : "");
    pendingCaretRef.current = 0;
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace") return;
    const el = e.currentTarget;
    if (el.selectionStart == null || el.selectionStart !== el.selectionEnd) return;
    const caret = el.selectionStart;

    // Chip shown + caret at the very start → open it for editing so letters can
    // be deleted up to the colon (caret lands right after the kind value).
    if (chip && caret === 0) {
      e.preventDefault();
      setEditingKind(true);
      pendingCaretRef.current = query.indexOf(" ");
      return;
    }
    // Caret right after an empty `kind:` prefix → remove the whole chip at once.
    const before = inputValue.slice(0, caret);
    const m = before.match(/(?:^|\s)(?:kind|type|k):$/i);
    if (m) {
      e.preventDefault();
      const from = caret - m[0].length;
      let next = inputValue.slice(0, from) + inputValue.slice(caret);
      if (next[from] === " ") next = next.slice(0, from) + next.slice(from + 1);
      setEditingKind(false);
      setQuery(next);
      pendingCaretRef.current = from;
    }
  };

  // Restore the caret after a chip open/remove reshapes the input value.
  useLayoutEffect(() => {
    const pos = pendingCaretRef.current;
    if (pos == null) return;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const p = Math.max(0, Math.min(pos, el.value.length));
    el.setSelectionRange(p, p);
  }, [query, editingKind]);

  const chipMeta = chip ? KIND_OPTIONS.find((o) => o.kind === chip.kind) : null;
  const ChipIcon = chipMeta ? getApp(chipMeta.appId).icon : null;
  const chipNode =
    chip && chipMeta && ChipIcon ? (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={removeChip}
        title={`Filtering to ${chipMeta.label} — click or backspace to remove`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-500/15 py-0.5 pl-1.5 pr-1 text-xs font-medium text-violet-700 dark:text-violet-300"
      >
        <ChipIcon className="h-3 w-3" />
        {chipMeta.label}
        <X className="h-3 w-3 opacity-60" />
      </button>
    ) : null;

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

  // A reference chip anywhere dispatches OPEN_ENTITY_EVENT; open its target
  // (notes navigate, the other four open in the shared popup).
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenEntityDetail>).detail;
      if (!detail?.id) return;
      if (detail.kind === "note") {
        router.push(`/notes/${detail.id}`);
        return;
      }
      setSelected({ kind: detail.kind, id: detail.id });
    };
    window.addEventListener(OPEN_ENTITY_EVENT, onOpen as EventListener);
    return () => window.removeEventListener(OPEN_ENTITY_EVENT, onOpen as EventListener);
  }, [router]);

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
        query={inputValue}
        onQueryChange={handleInputChange}
        inputRef={inputRef}
        onInputKeyDown={onInputKeyDown}
        inputPrefix={chipNode}
      >
        {open ? (
          <CommandPaletteResults
            query={query}
            onSetQuery={setQueryExternal}
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

/** Render marked search text, wrapping matched runs in an accented highlight. */
function Highlight({ text }: { text: string }) {
  return (
    <>
      {toHighlightSegments(text).map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="rounded-[3px] bg-violet-500/15 px-0.5 text-violet-700 dark:text-violet-300">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
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
  onSetQuery,
  onNavigate,
  onSelectEntity,
  onCapture,
}: {
  query: string;
  onSetQuery: (q: string) => void;
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
  const { filteredSearchPages, allNormalizedPages } = useNotesPageDerivedState({
    allPages: pages,
    recentPages: pages,
    pageSearchQuery: deferredQuery,
  });
  const { bookmarks } = useBookmarks();
  const { quotes } = useQuotes();
  const { events } = useEvents();

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

  // --- FTS ranked hits (when the index is ready) ---
  const searchReady = useSearchIndexReady();
  const useFts = searchReady && hasQuery;
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!useFts) {
        if (!cancelled) setHits([]);
        return;
      }
      const r = await searchEntities(deferredQuery, { limit: 60 });
      if (!cancelled) setHits(r);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useFts, deferredQuery]);

  // --- kind: filter discovery/completion ---
  // Empty query → show all kinds (discovery). Typing `kind:foo` → show matches to
  // complete. A bare `kind:note` with nothing to search yet → keep chips + prompt.
  // Selecting one rewrites the query with `kind:<value> `.
  const parsed = useMemo(() => parseSearchQuery(query), [query]);
  const kindToken = query.match(KIND_TOKEN_RE);
  const kindOnly = parsed.kinds.length > 0 && parsed.terms.length === 0 && parsed.phrases.length === 0;
  const showKinds = !hasQuery || kindToken !== null || kindOnly;
  const kindPartial = (kindToken?.[1] ?? "").toLowerCase();
  const kindOptions = kindToken
    ? KIND_OPTIONS.filter((o) => o.kind.startsWith(kindPartial) || o.label.toLowerCase().startsWith(kindPartial))
    : KIND_OPTIONS;
  const applyKind = (kind: string) => {
    onSetQuery(kindToken ? query.replace(KIND_TOKEN_RE, (m) => m.replace(/(?:kind|type|k):\w*$/i, `kind:${kind} `)) : `kind:${kind} `);
  };
  const activeKindLabels = parsed.kinds.map((k) => KIND_OPTIONS.find((o) => o.kind === k)?.label ?? k);

  const hitById = useMemo(() => new Map(hits.map((h) => [h.id, h])), [hits]);
  // Highlighted title node (falls back to plain text when not FTS / no hit).
  const hlTitle = (id: string, fallback: string) => {
    const hit = useFts ? hitById.get(id) : undefined;
    return hit ? <Highlight text={hit.title} /> : <>{fallback}</>;
  };
  const hlSnippet = (id: string) => (useFts ? hitById.get(id)?.snippet : undefined);

  // Reorder each app's loaded rows by FTS rank (keeps the rich per-kind display).
  const rankedByKind = useMemo(() => {
    const ids: Record<string, string[]> = {};
    for (const h of hits) (ids[h.kind] ??= []).push(h.id);
    return ids;
  }, [hits]);
  const orderBy = <T extends { id: string }>(kind: string, items: T[]): T[] => {
    const byId = new Map(items.map((it) => [it.id, it]));
    return (rankedByKind[kind] ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is T => Boolean(x))
      .slice(0, MAX_RESULTS);
  };

  // --- Entity results (FTS-ranked when ready, else in-JS substring match) ---
  const tasks = useFts
    ? orderBy("task", allTasks)
    : hasQuery
      ? allTasks.filter((t) => (t.title ?? "").toLowerCase().includes(q)).slice(0, MAX_RESULTS)
      : [];
  const notes = useFts
    ? orderBy("note", allNormalizedPages)
    : hasQuery
      ? filteredSearchPages.slice(0, MAX_RESULTS)
      : [];
  const bookmarkHits = useFts
    ? orderBy("bookmark", bookmarks)
    : hasQuery
      ? bookmarks
          .filter((b) => `${b.title} ${b.note} ${b.url} ${getLinkHost(b.url) ?? ""} ${b.tags.join(" ")}`.toLowerCase().includes(q))
          .slice(0, MAX_RESULTS)
      : [];
  const quoteHits = useFts
    ? orderBy("quote", quotes)
    : hasQuery
      ? quotes.filter((qt) => `${qt.text} ${qt.author}`.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
      : [];
  const eventHits = useFts
    ? orderBy("event", events)
    : hasQuery
      ? events.filter((e) => `${e.title} ${e.tags.join(" ")}`.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
      : [];

  const nothing =
    !(showKinds && kindOptions.length > 0) &&
    actionCmds.length === 0 &&
    navCmds.length === 0 &&
    createCmds.length === 0 &&
    tasks.length === 0 &&
    notes.length === 0 &&
    bookmarkHits.length === 0 &&
    quoteHits.length === 0 &&
    eventHits.length === 0;

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

      {kindOnly ? (
        <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Type to search {activeKindLabels.join(" / ")}…</p>
      ) : null}

      {showKinds && kindOptions.length > 0 ? (
        <CommandGroup heading={kindToken || kindOnly ? "Filter by kind" : "Filter search by kind"}>
          {kindOptions.map((o) => (
            <CommandItem
              key={`kind:${o.kind}`}
              value={`kind:${o.kind}`}
              onSelect={() => applyKind(o.kind)}
              className="items-center gap-3 rounded-lg px-3 py-2"
            >
              <AppChip appId={o.appId} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{o.label}</span>
              <CommandShortcut className="font-mono text-[11px] tracking-tight">kind:{o.kind}</CommandShortcut>
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
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {hlTitle(task.id, stripRefs(task.title || "") || "Untitled task")}
                </span>
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
              onSelect={() => onNavigate(`/notes/${page.id}`)}
              className="items-start gap-3 rounded-lg px-3 py-2"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <PageIcon emoji={page.emoji} className="h-4 w-4 text-base leading-none" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{hlTitle(page.id, page.title || "Untitled page")}</div>
                {hlSnippet(page.id) ? (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    <Highlight text={hlSnippet(page.id)!} />
                  </div>
                ) : page.summary ? (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{page.summary}</div>
                ) : null}
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
                <div className="truncate text-sm font-medium text-foreground">
                  {hlTitle(b.id, b.title || getLinkHost(b.url) || b.url || "Untitled")}
                </div>
                {hlSnippet(b.id) ? (
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    <Highlight text={hlSnippet(b.id)!} />
                  </div>
                ) : (
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{getLinkHost(b.url) || b.url}</div>
                )}
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
                <div className="line-clamp-2 text-sm text-foreground">{hlTitle(qt.id, stripRefs(qt.text || "") || "Untitled quote")}</div>
                {qt.author ? <div className="mt-0.5 truncate text-xs text-muted-foreground">— {qt.author}</div> : null}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {eventHits.length > 0 ? (
        <CommandGroup heading="Events">
          {eventHits.map((e) => (
            <CommandItem
              key={e.id}
              value={`event:${e.id}`}
              onSelect={() => onSelectEntity({ kind: "event", id: e.id })}
              className="items-center gap-3 rounded-lg px-3 py-2"
            >
              <AppChip appId="events" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {hlTitle(e.id, stripRefs(e.title || "") || "Untitled event")}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
    </>
  );
}

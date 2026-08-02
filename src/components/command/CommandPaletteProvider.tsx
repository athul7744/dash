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
import { ChevronDown, ChevronUp, Plus, X, Zap } from "lucide-react";

import { useSearchIndexReady } from "@/hooks/use-search-index";
import { useEntitiesByTag } from "@/hooks/use-entity-tags";
import { searchEntities, type SearchHit } from "@/lib/search/query";
import { toHighlightSegments } from "@/lib/search/match-query";
import {
  KIND_TOKEN_RE,
  TAG_TOKEN_RE,
  parseChips,
  reformOnInput,
  removeKind,
  removeTag,
  withKind,
  withTag,
} from "@/lib/search/filter-tokens";

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
import type { Task, Tag } from "@/lib/powersync/AppSchema";
import { APPS, getApp } from "@/lib/shared/apps";
import { stripRefs } from "@/lib/links/tokens";
import { cn } from "@/lib/shared/utils";
import { getDueDateInfo, getLinkHost } from "@/lib/tasks/tasks";
import { getTagColorClasses, getTagDotClass } from "@/lib/tasks/colors";

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

/** kind → app label, for the "Show all N in <App>" overflow rows. */
const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((o) => [o.kind, o.label]));

/** Stable empty set — the collapsed state and the reset both point at this. */
const EMPTY_KINDS: Set<string> = new Set();

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
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  // Loaded early so the input chip can resolve a tag's colour.
  const { data: allTags = [] } = useQuery<Tag>("SELECT id, name, color FROM tags ORDER BY name ASC");

  const openPalette = useCallback(() => {
    setQuery("");
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  const setQueryExternal = useCallback((q: string) => setQuery(q), []);

  // At most one kind + one tag chip; the input shows only the free terms.
  const chips = parseChips(query);
  const inputValue = chips.terms;

  const handleInputChange = (val: string) => setQuery(reformOnInput(query, val));

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace") return;
    const el = e.currentTarget;
    if (el.selectionStart == null || el.selectionStart !== el.selectionEnd || el.selectionStart !== 0) return;
    // Caret at the very start → drop the nearest chip (tag first, then kind).
    if (chips.tag) {
      e.preventDefault();
      setQuery(removeTag(query));
      pendingCaretRef.current = 0;
    } else if (chips.kind) {
      e.preventDefault();
      setQuery(removeKind(query));
      pendingCaretRef.current = 0;
    }
  };

  // Restore the caret after removing a chip reshapes the input value.
  useLayoutEffect(() => {
    const pos = pendingCaretRef.current;
    if (pos == null) return;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const p = Math.max(0, Math.min(pos, el.value.length));
    el.setSelectionRange(p, p);
  }, [query]);

  // Chips carry their type word ("kind" / "tag") so it's obvious what's filtered.
  const kindMeta = chips.kind ? KIND_OPTIONS.find((o) => o.kind === chips.kind) : null;
  const KindIcon = kindMeta ? getApp(kindMeta.appId).icon : null;
  const tagRec = chips.tag ? allTags.find((t) => (t.name ?? "").toLowerCase() === chips.tag!.toLowerCase()) : null;

  const chipNode =
    chips.kind || chips.tag ? (
      <span className="flex shrink-0 items-center gap-1">
        {chips.kind && kindMeta && KindIcon ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery(removeKind(query))}
            title={`Filtering to ${kindMeta.label} — click to remove`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-transparent bg-violet-500/15 py-0.5 pl-1.5 pr-1 text-xs font-medium text-violet-700 dark:text-violet-300"
          >
            <KindIcon className="h-3 w-3" />
            <span className="opacity-55">kind</span>
            {kindMeta.label}
            <X className="h-3 w-3 opacity-60" />
          </button>
        ) : null}
        {chips.tag ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setQuery(removeTag(query))}
            title={`Filtering to tag ${tagRec?.name ?? chips.tag} — click to remove`}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md py-0.5 pl-1.5 pr-1 text-xs font-medium",
              getTagColorClasses(tagRec?.color || "slate"),
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", getTagDotClass(tagRec?.color || "slate"))} />
            <span className="opacity-55">tag</span>
            {tagRec?.name ?? chips.tag}
            <X className="h-3 w-3 opacity-60" />
          </button>
        ) : null}
      </span>
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
  const { data: allTags = [] } = useQuery<Tag>("SELECT id, name, color FROM tags ORDER BY name ASC");

  // --- kind + tag filters (parsed as chips; combine, at most one each) ---
  const chips = useMemo(() => parseChips(query), [query]);
  const activeKind = chips.kind; // 'task' | 'note' | ... | null
  // Completion tokens show only while typing a not-yet-committed filter.
  const kindToken = !chips.kind ? query.match(KIND_TOKEN_RE) : null;
  const tagToken = !chips.tag ? query.match(TAG_TOKEN_RE) : null;

  const activeTag = chips.tag
    ? allTags.find((t) => (t.name ?? "").toLowerCase() === chips.tag!.toLowerCase())
    : undefined;
  const activeTagId = activeTag?.id ?? null;
  const tagEntities = useEntitiesByTag(activeTagId);
  const tagSet = useMemo(() => new Set(tagEntities.map((e) => e.entity_id)), [tagEntities]);
  // Free text (chips already stripped) narrows within the tag.
  const tagText = chips.terms.trim().toLowerCase();

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
  // The tag filter takes over result selection, so skip FTS while it's active/typing.
  const useFts = searchReady && hasQuery && !activeTagId && !tagToken;
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!useFts) {
        if (!cancelled) setHits([]);
        return;
      }
      const r = await searchEntities(deferredQuery, { limit: 250 });
      if (!cancelled) setHits(r);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [useFts, deferredQuery]);

  // Per-kind "Show all" expansion, tagged with the query it belongs to so a new
  // query collapses everything back to MAX_RESULTS without an effect.
  const [expandState, setExpandState] = useState<{ q: string; kinds: Set<string> }>({ q: "", kinds: EMPTY_KINDS });
  const expanded = expandState.q === deferredQuery ? expandState.kinds : EMPTY_KINDS;
  const toggleExpand = (kind: string) =>
    setExpandState((prev) => {
      const kinds = new Set(prev.q === deferredQuery ? prev.kinds : []);
      if (kinds.has(kind)) kinds.delete(kind);
      else kinds.add(kind);
      return { q: deferredQuery, kinds };
    });

  // --- kind: completion (typing `kind:…`) + a kind-only prompt ---
  // Selecting a kind adds/replaces the chip while preserving any active tag.
  const kindOnly = !!chips.kind && !chips.tag && !chips.terms.trim();
  const showKinds = kindToken !== null || kindOnly;
  const kindPartial = (kindToken?.[1] ?? "").toLowerCase();
  const kindOptions = kindToken
    ? KIND_OPTIONS.filter((o) => o.kind.startsWith(kindPartial) || o.label.toLowerCase().startsWith(kindPartial))
    : KIND_OPTIONS;
  const applyKind = (kind: string) => onSetQuery(withKind(query, kind));
  const activeKindLabel = chips.kind ? KIND_OPTIONS.find((o) => o.kind === chips.kind)?.label ?? chips.kind : "";

  // tag: completion — matching tag names to pick while typing `tag:…`.
  const tagPartial = (tagToken?.[1] ?? "").toLowerCase();
  const tagOptions = tagToken
    ? allTags.filter((t) => (t.name ?? "").toLowerCase().startsWith(tagPartial)).slice(0, 8)
    : [];
  const applyTag = (name: string) => onSetQuery(withTag(query, name));

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
  // Full ranked/filtered list per kind (uncapped); the render slices to
  // MAX_RESULTS unless the kind is expanded via its "Show all" row.
  const orderBy = <T extends { id: string }>(kind: string, items: T[]): T[] => {
    const byId = new Map(items.map((it) => [it.id, it]));
    return (rankedByKind[kind] ?? [])
      .map((id) => byId.get(id))
      .filter((x): x is T => Boolean(x));
  };
  const capFor = (kind: string, items: unknown[]) => (expanded.has(kind) ? items.length : MAX_RESULTS);

  // When a tag is active: filter each app's loaded rows to that tag's entities,
  // narrow by any free text, and (for a kind+tag combo) restrict to the kind.
  const inTag = <T extends { id: string }>(kind: string, items: T[], text: (it: T) => string): T[] =>
    activeKind && activeKind !== kind
      ? []
      : items.filter((it) => tagSet.has(it.id) && (!tagText || text(it).toLowerCase().includes(tagText)));

  // --- Entity results (tag filter → FTS-ranked → in-JS substring match) ---
  const tasks = activeTagId
    ? inTag("task", allTasks, (t) => t.title ?? "")
    : useFts
      ? orderBy("task", allTasks)
      : hasQuery
        ? allTasks.filter((t) => (t.title ?? "").toLowerCase().includes(q))
        : [];
  const notes = activeTagId
    ? inTag("note", allNormalizedPages, (p) => p.title ?? "")
    : useFts
      ? orderBy("note", allNormalizedPages)
      : hasQuery
        ? filteredSearchPages
        : [];
  const bookmarkHits = activeTagId
    ? inTag("bookmark", bookmarks, (b) => `${b.title} ${b.note} ${b.url}`)
    : useFts
      ? orderBy("bookmark", bookmarks)
      : hasQuery
        ? bookmarks.filter((b) => `${b.title} ${b.note} ${b.url} ${getLinkHost(b.url) ?? ""}`.toLowerCase().includes(q))
        : [];
  const quoteHits = activeTagId
    ? [] // quotes carry no tags
    : useFts
      ? orderBy("quote", quotes)
      : hasQuery
        ? quotes.filter((qt) => `${qt.text} ${qt.author}`.toLowerCase().includes(q))
        : [];
  const eventHits = activeTagId
    ? inTag("event", events, (e) => e.title ?? "")
    : useFts
      ? orderBy("event", events)
      : hasQuery
        ? events.filter((e) => `${e.title}`.toLowerCase().includes(q))
        : [];

  // "Show all N in <App>" / "Show less" toggle, shown when a kind overflows the cap.
  const overflowRow = (kind: string, total: number) =>
    total > MAX_RESULTS ? (
      <CommandItem
        key={`more:${kind}`}
        value={`more:${kind}`}
        onSelect={() => toggleExpand(kind)}
        className="items-center gap-3 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          {expanded.has(kind) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          {expanded.has(kind) ? "Show less" : `Show all ${total} in ${KIND_LABEL[kind]}`}
        </span>
      </CommandItem>
    ) : null;

  const nothing =
    !(showKinds && kindOptions.length > 0) &&
    tagOptions.length === 0 &&
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

      {!hasQuery ? (
        <p className="flex items-center gap-1.5 px-3 pb-2 pt-1 text-xs text-muted-foreground/70">
          Filter with
          <button
            type="button"
            onClick={() => onSetQuery("kind:")}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors hover:bg-accent"
          >
            kind:
          </button>
          or
          <button
            type="button"
            onClick={() => onSetQuery("tag:")}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80 transition-colors hover:bg-accent"
          >
            tag:
          </button>
        </p>
      ) : null}

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
        <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Type to search {activeKindLabel}…</p>
      ) : null}

      {tagOptions.length > 0 ? (
        <CommandGroup heading="Filter by tag">
          {tagOptions.map((t) => (
            <CommandItem
              key={`tag:${t.id}`}
              value={`tag:${t.id}`}
              onSelect={() => applyTag(t.name ?? "")}
              className="items-center gap-3 rounded-lg px-3 py-2"
            >
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", getTagDotClass(t.color || "slate"))} />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{t.name}</span>
              <CommandShortcut className="font-mono text-[11px] tracking-tight">tag:{t.name}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {activeTagId ? (
        <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">
          {activeKind ? `${activeKindLabel} tagged ` : "Everything tagged "}
          <span className="font-medium text-foreground">{activeTag?.name}</span>
          {chips.terms.trim() ? " · narrowing" : " · type to narrow"}
        </p>
      ) : null}

      {showKinds && kindOptions.length > 0 ? (
        <CommandGroup heading="Filter by kind">
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
          {tasks.slice(0, capFor("task", tasks)).map((task) => {
            const info = getDueDateInfo(task.due_date ? new Date(task.due_date) : undefined);
            const showChip = info.show && task.state !== "completed" && (info.label === "Overdue" || info.label === "Due Today");
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
          {overflowRow("task", tasks.length)}
        </CommandGroup>
      ) : null}

      {notes.length > 0 ? (
        <CommandGroup heading="Notes">
          {notes.slice(0, capFor("note", notes)).map((page) => (
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
          {overflowRow("note", notes.length)}
        </CommandGroup>
      ) : null}

      {bookmarkHits.length > 0 ? (
        <CommandGroup heading="Bookmarks">
          {bookmarkHits.slice(0, capFor("bookmark", bookmarkHits)).map((b) => (
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
          {overflowRow("bookmark", bookmarkHits.length)}
        </CommandGroup>
      ) : null}

      {quoteHits.length > 0 ? (
        <CommandGroup heading="Quotes">
          {quoteHits.slice(0, capFor("quote", quoteHits)).map((qt) => (
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
          {overflowRow("quote", quoteHits.length)}
        </CommandGroup>
      ) : null}

      {eventHits.length > 0 ? (
        <CommandGroup heading="Events">
          {eventHits.slice(0, capFor("event", eventHits)).map((e) => (
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
          {overflowRow("event", eventHits.length)}
        </CommandGroup>
      ) : null}
    </>
  );
}

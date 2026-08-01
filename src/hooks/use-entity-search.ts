"use client";

/**
 * All-entity search for the `[[` reference picker: matches notes, tasks,
 * bookmarks, quotes, and events against a query and returns a flat, capped,
 * ordered list.
 *
 * When the FTS5 index is ready it runs a ranked, full-text query (finds text
 * inside note bodies, not just titles). Until then — or if FTS5 is unavailable —
 * it falls back to the original in-JS substring match over each app's hooks, so
 * the picker always works. Mount it lazily (only while the picker is open).
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { useAllNotePages } from "@/hooks/use-notes";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useQuotes } from "@/hooks/use-quotes";
import { useEvents } from "@/hooks/use-events";
import { useSearchIndexReady } from "@/hooks/use-search-index";
import { searchEntities } from "@/lib/search/query";
import { stripHighlight } from "@/lib/search/match-query";
import { stripRefs, type RefKind } from "@/lib/links/tokens";
import type { Task } from "@/lib/powersync/AppSchema";
import { getLinkHost } from "@/lib/tasks/tasks";

export type EntitySearchResult = {
  kind: RefKind;
  id: string;
  label: string;
  /** Optional secondary line (host, author, matching snippet…). */
  sublabel?: string;
};

type TaskRow = Task & { id: string };

const PER_KIND = 6;

/**
 * @param query   the text after `[[`
 * @param excludeId an entity id to omit (the source itself — no self-links)
 */
export function useEntitySearch(query: string, excludeId?: string | null): EntitySearchResult[] {
  const q = query.trim();
  const ready = useSearchIndexReady();

  // --- JS fallback (also covers the pre-ready window) ---
  const { data: allTasks = [] } = useQuery<TaskRow>(
    "SELECT id, title FROM tasks WHERE state != 'trashed' AND parent_id IS NULL ORDER BY updated_at DESC",
  );
  const { pages } = useAllNotePages();
  const { bookmarks } = useBookmarks();
  const { quotes } = useQuotes();
  const { events } = useEvents();

  const fallback = useMemo(() => {
    const needle = q.toLowerCase();
    const match = (haystack: string) => (needle ? haystack.toLowerCase().includes(needle) : true);
    const take = <T,>(items: T[]) => items.slice(0, PER_KIND);

    const notes: EntitySearchResult[] = take(
      pages
        .filter((p) => p.id !== excludeId)
        .map((p) => ({ kind: "note" as const, id: p.id, label: (p.title || "Untitled page").trim() }))
        .filter((r) => match(r.label)),
    );
    const tasks: EntitySearchResult[] = take(
      allTasks
        .filter((t) => t.id !== excludeId)
        .map((t) => ({ kind: "task" as const, id: t.id, label: stripRefs(t.title || "") || "Untitled task" }))
        .filter((r) => match(r.label)),
    );
    const bookmarkHits: EntitySearchResult[] = take(
      bookmarks
        .filter((b) => b.id !== excludeId)
        .filter((b) => match(`${b.title} ${b.note} ${b.url} ${getLinkHost(b.url) ?? ""}`))
        .map((b) => ({
          kind: "bookmark" as const,
          id: b.id,
          label: b.title || getLinkHost(b.url) || b.url || "Untitled",
          sublabel: getLinkHost(b.url) || undefined,
        })),
    );
    const quoteHits: EntitySearchResult[] = take(
      quotes
        .filter((qt) => qt.id !== excludeId)
        .filter((qt) => match(`${qt.text} ${qt.author}`))
        .map((qt) => ({
          kind: "quote" as const,
          id: qt.id,
          label: stripRefs(qt.text || "") || "Untitled quote",
          sublabel: qt.author || undefined,
        })),
    );
    const eventHits: EntitySearchResult[] = take(
      events
        .filter((e) => e.id !== excludeId)
        .filter((e) => match(`${e.title} ${e.tags.join(" ")}`))
        .map((e) => ({ kind: "event" as const, id: e.id, label: stripRefs(e.title || "") || "Untitled event" })),
    );

    return [...notes, ...tasks, ...bookmarkHits, ...quoteHits, ...eventHits];
  }, [q, excludeId, pages, allTasks, bookmarks, quotes, events]);

  // --- FTS path (ranked, full-text; only when the index is ready) ---
  const [ftsResults, setFtsResults] = useState<EntitySearchResult[]>([]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!ready || !q) {
        if (!cancelled) setFtsResults([]);
        return;
      }
      const hits = await searchEntities(q, { excludeId, perKind: PER_KIND });
      if (!cancelled) {
        setFtsResults(
          hits.map((h) => ({
            kind: h.kind,
            id: h.id,
            label: stripHighlight(h.title),
            sublabel: h.snippet ? stripHighlight(h.snippet) : undefined,
          })),
        );
      }
    }, q ? 120 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, q, excludeId]);

  // Ready + typing → ranked FTS. Empty query or not-yet-built → the fallback list.
  return ready && q ? ftsResults : fallback;
}

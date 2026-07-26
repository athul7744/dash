"use client";

/**
 * All-entity search for the `[[` reference picker: matches notes, tasks,
 * bookmarks, quotes, and reminders against a query and returns a flat, capped,
 * ordered list. Reuses each app's existing hooks. Mount it lazily (only while
 * the picker is open) so the underlying reactive queries stay idle otherwise.
 */

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import { useAllNotePages } from "@/hooks/use-notes";
import { useBookmarks } from "@/hooks/use-bookmarks";
import { useQuotes } from "@/hooks/use-quotes";
import { useEvents } from "@/hooks/use-events";
import { stripRefs, type RefKind } from "@/lib/links/tokens";
import type { Task } from "@/lib/powersync/AppSchema";
import { getLinkHost } from "@/lib/tasks/tasks";

export type EntitySearchResult = {
  kind: RefKind;
  id: string;
  label: string;
  /** Optional secondary line (host, author, …). */
  sublabel?: string;
};

type TaskRow = Task & { id: string };

const PER_KIND = 6;

/**
 * @param query   the text after `[[`
 * @param excludeId an entity id to omit (the source itself — no self-links)
 */
export function useEntitySearch(query: string, excludeId?: string | null): EntitySearchResult[] {
  const q = query.trim().toLowerCase();

  const { data: allTasks = [] } = useQuery<TaskRow>(
    "SELECT id, title FROM tasks WHERE state != 'trashed' AND parent_id IS NULL ORDER BY updated_at DESC",
  );
  const { pages } = useAllNotePages();
  const { bookmarks } = useBookmarks();
  const { quotes } = useQuotes();
  const { events } = useEvents();

  return useMemo(() => {
    const match = (haystack: string) => (q ? haystack.toLowerCase().includes(q) : true);
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
}

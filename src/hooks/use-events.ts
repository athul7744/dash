"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@powersync/react";

import { useCurrentUserId } from "@/hooks/use-current-user-id";
import { useSystemPageBlocks, type SystemPageBlockRow } from "@/hooks/use-system-page-blocks";
import { systemPageId } from "@/lib/notes/system-pages";
import { materializeDueEvents } from "@/lib/events/materialize";
import { buildActionVocabulary, type VocabEntry } from "@/lib/events/actions";
import { parseBookmarkContent } from "@/lib/bookmarks/bookmarks";
import { parseQuoteContent } from "@/lib/quotes/quotes";
import { stripRefs, type RefKind } from "@/lib/links/tokens";
import {
  parseEventContent,
  parseOccurrenceContent,
  EVENT_BLOCK_TYPE,
  EVENTS_KEY,
  OCCURRENCE_BLOCK_TYPE,
  OCCURRENCE_SUBJECT_SQL,
  type EventItem,
  type Occurrence,
} from "@/lib/events/events";

function toEvent(row: SystemPageBlockRow): EventItem {
  return { id: row.id, sortRank: row.sort_rank ?? "", ...parseEventContent(row.content) };
}

/** Live list of recurring things ("events"), ordered by sort_rank. */
export function useEvents(): { events: EventItem[]; isLoading: boolean } {
  const { items, isLoading } = useSystemPageBlocks("event", EVENTS_KEY, EVENT_BLOCK_TYPE, toEvent);
  return { events: items, isLoading };
}

type EventRow = { id: string; content: string | null; sort_rank: string | null };

/** Live single event by id — for the full-page detail view. `null` when missing. */
export function useEvent(id: string | null | undefined): { event: EventItem | null; isLoading: boolean } {
  const { data = [], isLoading } = useQuery<EventRow>(
    id ? "SELECT id, content, sort_rank FROM blocks WHERE id = ? AND type = ? LIMIT 1" : "SELECT id, content, sort_rank FROM blocks WHERE 1 = 0",
    id ? [id, EVENT_BLOCK_TYPE] : [],
  );
  const event = useMemo(() => (data[0] ? toEvent(data[0]) : null), [data]);
  return { event, isLoading };
}

type OccurrenceRow = { id: string; content: string | null };

/**
 * Live occurrence log, newest first — all of them, or one thing's (`thingId`),
 * capped by `limit` for the paginated timeline / per-thing detail.
 */
export function useOccurrences(opts: { thingId?: string; limit?: number } = {}): { occurrences: Occurrence[]; isLoading: boolean } {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, "event", EVENTS_KEY) : null;
  const { thingId, limit } = opts;

  const where = ["page_id = ?", "type = ?"];
  const args: (string | number)[] = [pageId ?? "", OCCURRENCE_BLOCK_TYPE];
  if (thingId) {
    where.push(`${OCCURRENCE_SUBJECT_SQL} = ?`);
    args.push(thingId);
  }
  const sql = pageId
    ? `SELECT id, content FROM blocks WHERE ${where.join(" AND ")} ORDER BY json_extract(content, '$.at') DESC${limit ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : ""}`
    : "SELECT id, content FROM blocks WHERE 1 = 0";
  const { data = [], isLoading, isFetching } = useQuery<OccurrenceRow>(sql, pageId ? args : [], { reportFetching: true });

  // Settle latch (mirrors useSystemPageBlocks): while the user id resolves,
  // `pageId` is null and the query is the empty `WHERE 1 = 0` stub; and when it
  // swaps to the real query, useQuery briefly reports the old empty result with
  // isLoading=false before re-running. Both would read as "loaded, nothing here"
  // and flash a "not found" on the subject-detail page. Stay loading until the
  // real query has genuinely settled (not fetching); once settled, never flip
  // back so live updates don't blank the view.
  const [settled, setSettled] = useState(false);
  if (!settled && pageId !== null && !isLoading && !isFetching) setSettled(true);

  const occurrences = useMemo<Occurrence[]>(
    () =>
      data.map((r) => {
        const c = parseOccurrenceContent(r.content);
        return { id: r.id, thingId: c.subjectId, ...c };
      }),
    [data],
  );
  return { occurrences, isLoading: !settled };
}

export type ThingAggregate = { count: number; firstAt: string | null; lastAt: string | null };

/**
 * Per-thing occurrence aggregate (count / first / last), done entirely in SQLite
 * so the card list never materializes the occurrence rows in JS. Keyed by thing id.
 */
export function useThingAggregates(): Map<string, ThingAggregate> {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, "event", EVENTS_KEY) : null;
  const { data = [] } = useQuery<{ thing: string; n: number; first: string | null; last: string | null }>(
    pageId
      ? `SELECT ${OCCURRENCE_SUBJECT_SQL} AS thing, COUNT(*) AS n, MIN(json_extract(content, '$.at')) AS first, MAX(json_extract(content, '$.at')) AS last
         FROM blocks WHERE page_id = ? AND type = ? GROUP BY ${OCCURRENCE_SUBJECT_SQL}`
      : "SELECT NULL AS thing, 0 AS n, NULL AS first, NULL AS last WHERE 1 = 0",
    pageId ? [pageId, OCCURRENCE_BLOCK_TYPE] : [],
  );
  return useMemo(() => {
    const map = new Map<string, ThingAggregate>();
    for (const r of data) if (r.thing) map.set(r.thing, { count: r.n, firstAt: r.first, lastAt: r.last });
    return map;
  }, [data]);
}

/**
 * Live "action" vocabulary across every occurrence — distinct `$.action` values
 * with counts, collapsed by case-key into canonical entries (`buildActionVocabulary`).
 * Feeds the ActionInput typeahead/dedup/fuzzy. GROUP BY the extracted expression
 * (SQLite can't reference a SELECT alias in WHERE); NULL/'' (old rows) drop out.
 */
export function useActionVocabulary(): VocabEntry[] {
  const userId = useCurrentUserId();
  const pageId = userId ? systemPageId(userId, "event", EVENTS_KEY) : null;
  const { data = [] } = useQuery<{ action: string | null; n: number }>(
    pageId
      ? `SELECT json_extract(content, '$.action') AS action, COUNT(*) AS n
         FROM blocks
         WHERE page_id = ? AND type = ?
           AND json_extract(content, '$.action') IS NOT NULL
           AND json_extract(content, '$.action') <> ''
         GROUP BY json_extract(content, '$.action')`
      : "SELECT NULL AS action, 0 AS n WHERE 1 = 0",
    pageId ? [pageId, OCCURRENCE_BLOCK_TYPE] : [],
  );
  return useMemo(() => buildActionVocabulary(data.map((r) => ({ action: r.action ?? "", count: r.n }))), [data]);
}

const inClause = (ids: string[]) => ids.map(() => "?").join(",");

/**
 * Resolve occurrence subjects to display labels, keyed by subject id. Since each
 * occurrence carries its `subjectKind`, we resolve per-kind (pages by id for
 * notes, tasks by id, blocks by id for event/bookmark/quote) — the note subject
 * is a *page* id, so the edge-anchored `resolve.ts` join doesn't apply. Pass a
 * memoized `subjects` list. Missing ids simply don't appear (caller falls back).
 */
export function useSubjectLabels(subjects: { id: string; kind: RefKind }[]): Map<string, string> {
  const { noteIds, taskIds, blockEntries } = useMemo(() => {
    const notes = new Set<string>();
    const tasks = new Set<string>();
    const blocks = new Map<string, RefKind>();
    for (const s of subjects) {
      if (!s.id) continue;
      if (s.kind === "note") notes.add(s.id);
      else if (s.kind === "task") tasks.add(s.id);
      else blocks.set(s.id, s.kind); // event | bookmark | quote
    }
    return { noteIds: [...notes], taskIds: [...tasks], blockEntries: [...blocks.entries()] };
  }, [subjects]);
  const blockIds = useMemo(() => blockEntries.map(([id]) => id), [blockEntries]);

  const { data: notes = [] } = useQuery<{ id: string; title: string | null }>(
    noteIds.length ? `SELECT id, title FROM pages WHERE id IN (${inClause(noteIds)})` : "SELECT NULL AS id, NULL AS title WHERE 1 = 0",
    noteIds,
  );
  const { data: tasks = [] } = useQuery<{ id: string; title: string | null }>(
    taskIds.length ? `SELECT id, title FROM tasks WHERE id IN (${inClause(taskIds)})` : "SELECT NULL AS id, NULL AS title WHERE 1 = 0",
    taskIds,
  );
  const { data: blocks = [] } = useQuery<{ id: string; content: string | null }>(
    blockIds.length ? `SELECT id, content FROM blocks WHERE id IN (${inClause(blockIds)})` : "SELECT NULL AS id, NULL AS content WHERE 1 = 0",
    blockIds,
  );

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const n of notes) if (n.id) map.set(n.id, (n.title ?? "").trim() || "Untitled page");
    for (const t of tasks) if (t.id) map.set(t.id, stripRefs(t.title ?? "") || "Untitled task");
    const kindById = new Map(blockEntries);
    for (const b of blocks) {
      if (!b.id) continue;
      const kind = kindById.get(b.id);
      if (kind === "bookmark") {
        const x = parseBookmarkContent(b.content);
        map.set(b.id, x.title || x.url || "Untitled bookmark");
      } else if (kind === "quote") {
        const x = parseQuoteContent(b.content);
        map.set(b.id, stripRefs(x.text ?? "") || "Untitled quote");
      } else {
        const x = parseEventContent(b.content);
        map.set(b.id, stripRefs(x.title ?? "") || "Untitled event");
      }
    }
    return map;
  }, [notes, tasks, blocks, blockEntries]);
}

/**
 * Fire the events reconciler once on mount (fire-and-forget, idempotent) — safe
 * on both the dashboard and /events, and under StrictMode double-invoke.
 */
export function useEventMaterializer(): void {
  useEffect(() => {
    void materializeDueEvents();
  }, []);
}

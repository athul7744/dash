/**
 * Full-text search over logged occurrences (the events Timeline only — kept out
 * of the global ⌘K index so occurrences don't drown everything else).
 *
 * Text fields (action/place/note) match via the `occurrence_index` FTS table
 * across *all* history — not the newest-N window the timeline browses. Matching
 * by subject name is done at the call site (the subject label isn't stored here):
 * the caller passes the ids of subjects whose label matched, and every
 * occurrence of those subjects is folded in.
 */

import { db } from "@/lib/powersync/db";
import type { RefKind } from "@/lib/links/tokens";
import { isSearchIndexReady } from "./search-index";
import { buildMatch, HL_END, HL_START, parseSearchQuery } from "./match-query";

export type OccurrenceHit = {
  occId: string;
  thingId: string;
  thingKind: RefKind;
  at: string;
  /** action/place/note carry HL markers when matched via text (empty otherwise). */
  action: string;
  place: string;
  note: string;
};

// Columns: occ_id(0) thing_id(1) thing_kind(2) at(3) action(4) place(5) note(6).
const OCC_BM25 = "bm25(occurrence_index, 0.0, 0.0, 0.0, 0.0, 5.0, 3.0, 2.0)";

type Row = { occId: string; thingId: string; thingKind: RefKind; at: string; action: string; place: string; note: string };

/**
 * Occurrences matching `query` by text (FTS, highlighted) unioned with every
 * occurrence of a subject in `titleThingIds` (name matched by the caller).
 * Newest first. Returns `[]` when the index isn't ready — caller falls back.
 */
export async function searchOccurrences(
  query: string,
  opts: { titleThingIds?: string[]; limit?: number } = {},
): Promise<OccurrenceHit[]> {
  const q = query.trim();
  if (!q || !isSearchIndexReady()) return [];

  const limit = opts.limit ?? 300;
  const titleThingIds = opts.titleThingIds ?? [];
  const byId = new Map<string, OccurrenceHit>();

  const parsed = parseSearchQuery(q);
  const match = buildMatch({ kinds: [], phrases: parsed.phrases, terms: parsed.terms });
  if (match) {
    const rows = await db.getAll<Row>(
      `SELECT occ_id AS occId, thing_id AS thingId, thing_kind AS thingKind, at,
              highlight(occurrence_index, 4, '${HL_START}', '${HL_END}') AS action,
              highlight(occurrence_index, 5, '${HL_START}', '${HL_END}') AS place,
              highlight(occurrence_index, 6, '${HL_START}', '${HL_END}') AS note
       FROM occurrence_index
       WHERE occurrence_index MATCH ?
       ORDER BY ${OCC_BM25}
       LIMIT ?`,
      [match, limit],
    );
    for (const r of rows) byId.set(r.occId, r);
  }

  if (titleThingIds.length) {
    const placeholders = titleThingIds.map(() => "?").join(",");
    const rows = await db.getAll<Row>(
      `SELECT occ_id AS occId, thing_id AS thingId, thing_kind AS thingKind, at, action, place, note
       FROM occurrence_index
       WHERE thing_id IN (${placeholders})
       ORDER BY at DESC
       LIMIT ?`,
      [...titleThingIds, limit],
    );
    for (const r of rows) if (!byId.has(r.occId)) byId.set(r.occId, r);
  }

  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

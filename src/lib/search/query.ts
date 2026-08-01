/**
 * Ranked full-text search over the local FTS5 index. `searchEntities` is the one
 * query surface for both ⌘K and the `[[` picker. Callers check
 * `isSearchIndexReady()` first and fall back to their in-memory match when it's
 * false (index not built, or FTS5 unavailable).
 *
 * The MATCH sanitizer is pure and unit-tested; the DB call is thin.
 */

import { db } from "@/lib/powersync/db";
import type { RefKind } from "@/lib/links/tokens";
import { isSearchIndexReady } from "./search-index";
import {
  buildMatch,
  escapeLike,
  fuzzyMatchTitle,
  HL_END,
  HL_START,
  markLike,
  parseSearchQuery,
  type ParsedQuery,
} from "./match-query";

export { toMatchQuery } from "./match-query";

// Marked with HL_START/HL_END sentinels around matches; render via toHighlightSegments.
export type SearchHit = { kind: RefKind; id: string; title: string; snippet?: string };

export type SearchOptions = {
  kinds?: RefKind[];
  /** Hard cap on total rows returned. */
  limit?: number;
  /** If set, cap results per kind (applied after ranking). */
  perKind?: number;
  /** Omit this entity (the source itself — no self-links). */
  excludeId?: string | null;
};

// Column order in `search_index`: kind(0) entity_id(1) title(2) body(3) aux(4).
// bm25 weights: title ≫ body > aux; the two UNINDEXED columns get 0.
const BM25 = "bm25(search_index, 0.0, 0.0, 10.0, 2.0, 1.0)";
const MIN_MATCH_LEN = 2;
// Rows scanned by the fuzzy fallback (only runs when exact/prefix finds nothing).
const FUZZY_SCAN_LIMIT = 2000;

function inClause(column: string, values: string[]): { sql: string; params: string[] } {
  if (!values.length) return { sql: "", params: [] };
  return { sql: ` AND ${column} IN (${values.map(() => "?").join(",")})`, params: values };
}

function capPerKind(hits: SearchHit[], perKind: number): SearchHit[] {
  const seen = new Map<string, number>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    const n = seen.get(h.kind) ?? 0;
    if (n >= perKind) continue;
    seen.set(h.kind, n + 1);
    out.push(h);
  }
  return out;
}

type Row = { kind: RefKind; id: string; title: string; body_snip: string };

/**
 * Ranked hits across the index. Returns `[]` for an empty/whitespace query.
 * Assumes `isSearchIndexReady()` — guard at the call site and use your fallback
 * otherwise (this returns `[]` rather than throwing if the index is missing).
 */
export async function searchEntities(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const raw = query.trim();
  if (!raw || !isSearchIndexReady()) return [];

  // Parse `kind:` filters, "exact phrases", and free terms. The parsed kinds
  // intersect any caller-supplied kinds; contradictions → no results.
  const parsed = parseSearchQuery(raw);
  const kinds = intersectKinds(opts.kinds, parsed.kinds);
  if (kinds && kinds.length === 0) return [];
  if (!parsed.phrases.length && !parsed.terms.length) return [];

  const limit = opts.limit ?? (opts.perKind ? opts.perKind * 6 : 50);
  const kindFilter = inClause("kind", kinds ?? []);
  const exclude = opts.excludeId ? { sql: " AND entity_id != ?", params: [opts.excludeId] } : { sql: "", params: [] };

  // Only 1-char terms and no phrase → FTS prefix index can't help; scan with LIKE.
  const longestTerm = parsed.terms.reduce((n, t) => Math.max(n, t.length), 0);
  const useLike = !parsed.phrases.length && longestTerm < MIN_MATCH_LEN;

  let rows: Row[];
  if (useLike) {
    const term = parsed.terms[0] ?? "";
    const like = `%${escapeLike(term.toLowerCase())}%`;
    rows = await db.getAll<Row>(
      `SELECT kind, entity_id AS id, title, '' AS body_snip
       FROM search_index
       WHERE (title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR aux LIKE ? ESCAPE '\\')${kindFilter.sql}${exclude.sql}
       LIMIT ?`,
      [like, like, like, ...kindFilter.params, ...exclude.params, limit],
    );
    const hits = rows.map((r) => ({ kind: r.kind, id: r.id, title: markLike(r.title, term), snippet: undefined }));
    return opts.perKind ? capPerKind(hits, opts.perKind) : hits;
  }

  const match = buildMatch(parsed);
  if (!match) return [];
  // highlight() marks matches across the whole title; snippet() gives a wider
  // (24-token) body excerpt with the same markers so the UI can show + highlight.
  // Markers are constant PUA chars → inline as SQL literals (FTS5 wants literals here).
  rows = await db.getAll<Row>(
    `SELECT kind, entity_id AS id,
            highlight(search_index, 2, '${HL_START}', '${HL_END}') AS title,
            snippet(search_index, 3, '${HL_START}', '${HL_END}', '…', 24) AS body_snip
     FROM search_index
     WHERE search_index MATCH ?${kindFilter.sql}${exclude.sql}
     ORDER BY ${BM25}
     LIMIT ?`,
    [match, ...kindFilter.params, ...exclude.params, limit],
  );

  let hits: SearchHit[] = rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    snippet: r.body_snip ? r.body_snip : undefined,
  }));

  // Typo tolerance: if exact/prefix found nothing, fall back to fuzzy title match
  // (phrases stay exact — a quoted query opts out of fuzzy).
  if (hits.length === 0 && !parsed.phrases.length) {
    hits = await fuzzyFallback(parsed, kindFilter, exclude, limit);
  }

  return opts.perKind ? capPerKind(hits, opts.perKind) : hits;
}

/** Intersect caller kinds with parsed `kind:` kinds (either may be empty = no restriction). */
function intersectKinds(a: RefKind[] | undefined, b: RefKind[]): RefKind[] | undefined {
  if (!a?.length && !b.length) return undefined;
  if (!a?.length) return b;
  if (!b.length) return a;
  return a.filter((k) => b.includes(k));
}

/** Edit-distance title match over a bounded scan; only runs when FTS is empty. */
async function fuzzyFallback(
  parsed: ParsedQuery,
  kindFilter: { sql: string; params: string[] },
  exclude: { sql: string; params: string[] },
  limit: number,
): Promise<SearchHit[]> {
  const candidates = await db.getAll<{ kind: RefKind; id: string; title: string }>(
    `SELECT kind, entity_id AS id, title FROM search_index WHERE 1=1${kindFilter.sql}${exclude.sql} LIMIT ?`,
    [...kindFilter.params, ...exclude.params, FUZZY_SCAN_LIMIT],
  );

  const scored: Array<{ hit: SearchHit; distance: number; len: number }> = [];
  for (const c of candidates) {
    const m = fuzzyMatchTitle(c.title, parsed.terms);
    if (m) scored.push({ hit: { kind: c.kind, id: c.id, title: m.marked }, distance: m.distance, len: c.title.length });
  }
  scored.sort((a, b) => a.distance - b.distance || a.len - b.len);
  return scored.slice(0, limit).map((s) => s.hit);
}

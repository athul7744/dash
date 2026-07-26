/**
 * Resolve an opaque entity id (as stored in `edges`) to a displayable
 * `{ kind, id, label }`, given the joined DB row. Ids are unique across
 * `tasks`/`blocks`/`pages`, so the row that matched tells us the kind:
 *   - a task row            → task
 *   - a block on a system page (kind bookmark/quote/reminder) → that app
 *   - a block on a note page (kind IS NULL) → the note (its page)
 * Pure so it can be shared by the backlinks hook and the graph builder.
 */

import { parseBookmarkContent } from "@/lib/bookmarks/bookmarks";
import { parseQuoteContent } from "@/lib/quotes/quotes";
import { parseEventContent } from "@/lib/events/events";
import { stripRefs, type RefKind } from "@/lib/links/tokens";

export type ResolvedEntity = { kind: RefKind; id: string; label: string };

/** Columns the resolver needs (from a LEFT JOIN of edges → tasks/blocks/pages). */
export type EntityJoinRow = {
  source_id: string;
  task_id: string | null;
  task_title: string | null;
  block_id: string | null;
  block_type: string | null;
  block_content: string | null;
  page_id: string | null;
  page_title: string | null;
  /** `json_extract(page.properties,'$.kind')` — null for real note pages. */
  page_kind: string | null;
};

export function classifyEntityRow(row: EntityJoinRow): ResolvedEntity | null {
  if (row.task_id) {
    return { kind: "task", id: row.source_id, label: stripRefs(row.task_title ?? "") || "Untitled task" };
  }
  if (!row.block_id) return null;

  switch (row.page_kind) {
    case "bookmark": {
      const b = parseBookmarkContent(row.block_content);
      return { kind: "bookmark", id: row.source_id, label: b.title || b.url || "Untitled bookmark" };
    }
    case "quote": {
      const q = parseQuoteContent(row.block_content);
      return { kind: "quote", id: row.source_id, label: stripRefs(q.text ?? "") || "Untitled quote" };
    }
    case "event": {
      const e = parseEventContent(row.block_content);
      return { kind: "event", id: row.source_id, label: stripRefs(e.title ?? "") || "Untitled event" };
    }
    default:
      // A block on a note page → the note itself (collapse block → page).
      if (!row.page_id) return null;
      return { kind: "note", id: row.page_id, label: (row.page_title ?? "").trim() || "Untitled page" };
  }
}

/** SQL that produces EntityJoinRow columns for `edges` aliased `e`. */
export const ENTITY_JOIN_SQL = [
  "e.source_block_id AS source_id,",
  "t.id AS task_id, t.title AS task_title,",
  "b.id AS block_id, b.type AS block_type, b.content AS block_content,",
  "bpage.id AS page_id, bpage.title AS page_title,",
  "json_extract(bpage.properties, '$.kind') AS page_kind",
].join(" ");

export const ENTITY_JOIN_FROM = [
  "LEFT JOIN tasks t ON t.id = e.source_block_id",
  "LEFT JOIN blocks b ON b.id = e.source_block_id",
  "LEFT JOIN pages bpage ON bpage.id = b.page_id",
].join(" ");

/**
 * Pure text derivation for the search index. Turns a source row (note page,
 * task, or a bookmark/quote/event block) into a flat `{ kind, id, title, body,
 * aux }` document the FTS5 table stores. No DB access here — callers pass the
 * rows in — so every branch is unit-testable and reuses the same parsers the
 * rest of the app already trusts.
 */

import { extractNoteText } from "@/lib/notes/notes-content";
import { parseBookmarkContent } from "@/lib/bookmarks/bookmarks";
import { parseQuoteContent } from "@/lib/quotes/quotes";
import { parseEventContent, parseOccurrenceContent } from "@/lib/events/events";
import { stripRefs, type RefKind } from "@/lib/links/tokens";
import { getLinkHost } from "@/lib/tasks/tasks";

/** One row of the FTS index — the unit a user navigates to. */
export type SearchDoc = { kind: RefKind; id: string; title: string; body: string; aux: string };

/** Block kinds that live on a system page and map 1:1 to a search entity. */
export type BlockEntityKind = "bookmark" | "quote" | "event";

function parseTags(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

const join = (parts: Array<string | null | undefined>) => parts.filter(Boolean).join(" ").trim();

export function deriveTask(row: { id: string; title: string | null; tags: string | null; link: string | null }): SearchDoc {
  return {
    kind: "task",
    id: row.id,
    title: stripRefs(row.title ?? "") || "Untitled task",
    body: "",
    aux: join([parseTags(row.tags).join(" "), row.link]),
  };
}

/** A note page's searchable text = its title + every note block's plain text. */
export function deriveNotePage(page: { id: string; title: string | null }, blockContents: Array<string | null>): SearchDoc {
  return {
    kind: "note",
    id: page.id,
    title: (page.title ?? "").trim() || "Untitled page",
    body: join(blockContents.map((c) => extractNoteText(c))),
    aux: "",
  };
}

export function deriveBlockEntity(kind: BlockEntityKind, row: { id: string; content: string | null }): SearchDoc {
  switch (kind) {
    case "bookmark": {
      const b = parseBookmarkContent(row.content);
      const host = getLinkHost(b.url) ?? "";
      return {
        kind,
        id: row.id,
        title: b.title || host || b.url || "Untitled bookmark",
        body: b.note,
        aux: join([b.url, host, b.tags.join(" ")]),
      };
    }
    case "quote": {
      const q = parseQuoteContent(row.content);
      return {
        kind,
        id: row.id,
        title: stripRefs(q.text ?? "") || "Untitled quote",
        body: q.text,
        aux: q.author,
      };
    }
    case "event": {
      const e = parseEventContent(row.content);
      return {
        kind,
        id: row.id,
        title: stripRefs(e.title ?? "") || "Untitled event",
        body: "",
        aux: e.tags.join(" "),
      };
    }
  }
}

/** A logged occurrence — kept in its own index (timeline search only, not ⌘K). */
export type OccurrenceDoc = {
  occId: string;
  thingId: string;
  thingKind: string;
  at: string;
  action: string;
  place: string;
  note: string;
};

export function deriveOccurrence(row: { id: string; content: string | null }): OccurrenceDoc {
  const c = parseOccurrenceContent(row.content);
  return { occId: row.id, thingId: c.subjectId, thingKind: c.subjectKind, at: c.at, action: c.action, place: c.place, note: c.note };
}

import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { deleteEntityEdges } from "@/lib/links/links";
import { ensureSystemPage } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";

/**
 * Quotes are stored in the notes backend as one feature-owned "system page"
 * (kind "quote") whose blocks are the quotes — each a `type="quote"` block
 * whose `content` is JSON `{ text, author, favorite }`. System pages are hidden
 * from every /notes listing, so quotes never leak into the notes app.
 *
 * The page holds a single collection ("library"). `ensureSystemPage` seeds an
 * empty `type="text"` starter block, which is ignored (we only read `quote`
 * blocks).
 */

export const QUOTES_KEY = "library";
export const QUOTE_BLOCK_TYPE = "quote";

export interface Quote {
  id: string;
  text: string;
  author: string;
  favorite: boolean;
  sortRank: string;
}

/** Shape stored in `blocks.content` for a quote block. */
interface QuoteContent {
  text: string;
  author: string;
  favorite: boolean;
}

const SQL_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

/** Idempotently create the quotes page. Returns its id. */
export async function ensureQuotesPage(): Promise<string> {
  return ensureSystemPage({ kind: "quote", key: QUOTES_KEY, title: "Quotes" });
}

/** Parse a `blocks.content` string into a Quote, tolerating malformed rows. */
export function parseQuoteContent(raw: string | null | undefined): QuoteContent {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<QuoteContent>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      author: typeof parsed.author === "string" ? parsed.author : "",
      favorite: parsed.favorite === true,
    };
  } catch {
    return { text: "", author: "", favorite: false };
  }
}

/** Append a new quote to the collection. Returns the new block id. */
export async function createQuote(input: { text?: string; author?: string } = {}): Promise<string> {
  const pageId = await ensureQuotesPage();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId);
  const content: QuoteContent = {
    text: input.text ?? "",
    author: input.author ?? "",
    favorite: false,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, QUOTE_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  return id;
}

/** Overwrite a quote's text/author (favorite unchanged). */
export async function updateQuote(id: string, patch: { text: string; author: string }): Promise<void> {
  const current = await readQuoteContent(id);
  if (!current) return;
  await writeQuoteContent(id, { ...current, text: patch.text, author: patch.author });
}

/** Flip a quote's favorite flag. */
export async function toggleFavorite(id: string): Promise<void> {
  const current = await readQuoteContent(id);
  if (!current) return;
  await writeQuoteContent(id, { ...current, favorite: !current.favorite });
}

export async function deleteQuote(id: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
  await deleteEntityEdges(id);
}

async function readQuoteContent(id: string): Promise<QuoteContent | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? LIMIT 1`,
    [id],
  );
  return row ? parseQuoteContent(row.content) : null;
}

async function writeQuoteContent(id: string, content: QuoteContent): Promise<void> {
  await db.execute(
    `UPDATE blocks SET content = ?, updated_at = ${SQL_UTC_NOW} WHERE id = ?`,
    [JSON.stringify(content), id],
  );
}

/** A sort rank after the last existing quote (or the middle if none). */
async function nextSortRank(pageId: string): Promise<string> {
  const last = await db.getOptional<{ sort_rank: string }>(
    `SELECT sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank DESC LIMIT 1`,
    [pageId, QUOTE_BLOCK_TYPE],
  );
  if (!last?.sort_rank) return LexoRank.middle().format();
  try {
    return LexoRank.parse(last.sort_rank).genNext().format();
  } catch {
    return LexoRank.middle().format();
  }
}

import { LexoRank } from "lexorank";
import { v4 as uuidv4 } from "uuid";

import { deleteEntityEdges } from "@/lib/links/links";
import { setEntityTags, deleteEntityTags } from "@/lib/tags/entity-tags";
import { deleteEntityAttachments } from "@/lib/storage/attachments";
import { deleteSubjectOccurrences } from "@/lib/events/events";
import { ensureSystemPage } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { SQL_UTC_NOW_EXPRESSION } from "@/lib/shared/debounced-update";
import { getLinkHost, normalizeUrl } from "@/lib/tasks/tasks";

/**
 * Bookmarks are stored in the notes backend as one feature-owned "system page"
 * (kind "bookmark") whose blocks are the bookmarks — each a `type="bookmark"`
 * block whose `content` is JSON `{ url, title, note, favorite, unread, addedAt }`.
 * System pages are hidden from every /notes listing, so bookmarks never leak into
 * the notes app. Mirrors the Quotes app (no schema migration).
 *
 * Tag membership lives in the `entity_tags` table (see `setEntityTags`);
 * filtering is an indexed join on that table.
 */

export const BOOKMARKS_KEY = "library";
export const BOOKMARK_BLOCK_TYPE = "bookmark";

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  note: string;
  favorite: boolean;
  unread: boolean;
  addedAt: string;
  sortRank: string;
}

/** Shape stored in `blocks.content` for a bookmark block. */
interface BookmarkContent {
  url: string;
  title: string;
  note: string;
  favorite: boolean;
  unread: boolean;
  addedAt: string;
}

/** Idempotently create the bookmarks page. Returns its id. */
export async function ensureBookmarksPage(): Promise<string> {
  return ensureSystemPage({ kind: "bookmark", key: BOOKMARKS_KEY, title: "Bookmarks" });
}

/** Parse a `blocks.content` string into bookmark content, tolerating malformed rows. */
export function parseBookmarkContent(raw: string | null | undefined): BookmarkContent {
  try {
    const parsed = JSON.parse(raw ?? "{}") as Partial<BookmarkContent>;
    return {
      url: typeof parsed.url === "string" ? parsed.url : "",
      title: typeof parsed.title === "string" ? parsed.title : "",
      note: typeof parsed.note === "string" ? parsed.note : "",
      favorite: parsed.favorite === true,
      unread: parsed.unread !== false,
      addedAt: typeof parsed.addedAt === "string" ? parsed.addedAt : "",
    };
  } catch {
    return { url: "", title: "", note: "", favorite: false, unread: true, addedAt: "" };
  }
}

/** Append a new bookmark to the collection. Returns the new block id. */
export async function createBookmark(
  input: { url: string; title?: string; note?: string; tags?: string[] },
): Promise<string> {
  const pageId = await ensureBookmarksPage();
  const userId = await getCurrentUserId();
  const id = uuidv4();
  const now = new Date().toISOString();
  const sortRank = await nextSortRank(pageId);
  const url = normalizeUrl(input.url);
  const content: BookmarkContent = {
    url,
    title: input.title?.trim() || getLinkHost(url) || url,
    note: input.note ?? "",
    favorite: false,
    unread: true,
    addedAt: now,
  };
  await db.execute(
    `INSERT INTO blocks (id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
    [id, userId, pageId, BOOKMARK_BLOCK_TYPE, JSON.stringify(content), sortRank, now],
  );
  if (input.tags?.length) await setEntityTags(id, "bookmark", input.tags);
  return id;
}

/** Overwrite a bookmark's editable fields (favorite/unread/addedAt unchanged). */
export async function updateBookmark(
  id: string,
  patch: Partial<Pick<BookmarkContent, "url" | "title" | "note">> & { tags?: string[] },
): Promise<void> {
  // Tags live in entity_tags.
  if (patch.tags !== undefined) await setEntityTags(id, "bookmark", patch.tags);
  const { tags: _ignored, ...contentPatch } = patch;
  if (Object.keys(contentPatch).length === 0) return;
  const current = await readBookmarkContent(id);
  if (!current) return;
  const next: BookmarkContent = { ...current, ...contentPatch };
  if (contentPatch.url !== undefined) next.url = normalizeUrl(contentPatch.url);
  await writeBookmarkContent(id, next);
}

/** Flip a bookmark's favorite flag. */
export async function toggleFavorite(id: string): Promise<void> {
  const current = await readBookmarkContent(id);
  if (!current) return;
  await writeBookmarkContent(id, { ...current, favorite: !current.favorite });
}

/** Mark a bookmark read/unread. */
export async function markRead(id: string, read: boolean): Promise<void> {
  const current = await readBookmarkContent(id);
  if (!current) return;
  await writeBookmarkContent(id, { ...current, unread: !read });
}

/** Replace a bookmark's tag id list (stored in entity_tags). */
export async function setTags(id: string, tags: string[]): Promise<void> {
  await setEntityTags(id, "bookmark", tags);
}

export async function deleteBookmark(id: string): Promise<void> {
  await db.execute(`DELETE FROM blocks WHERE id = ?`, [id]);
  await deleteEntityEdges(id);
  await deleteSubjectOccurrences(id);
  await deleteEntityTags(id);
  await deleteEntityAttachments(id);
}

async function readBookmarkContent(id: string): Promise<BookmarkContent | null> {
  const row = await db.getOptional<{ content: string | null }>(
    `SELECT content FROM blocks WHERE id = ? LIMIT 1`,
    [id],
  );
  return row ? parseBookmarkContent(row.content) : null;
}

async function writeBookmarkContent(id: string, content: BookmarkContent): Promise<void> {
  await db.execute(
    `UPDATE blocks SET content = ?, updated_at = ${SQL_UTC_NOW_EXPRESSION} WHERE id = ?`,
    [JSON.stringify(content), id],
  );
}

/** A sort rank after the last existing bookmark (or the middle if none). */
async function nextSortRank(pageId: string): Promise<string> {
  const last = await db.getOptional<{ sort_rank: string }>(
    `SELECT sort_rank FROM blocks WHERE page_id = ? AND type = ? ORDER BY sort_rank DESC LIMIT 1`,
    [pageId, BOOKMARK_BLOCK_TYPE],
  );
  if (!last?.sort_rank) return LexoRank.middle().format();
  try {
    return LexoRank.parse(last.sort_rank).genNext().format();
  } catch {
    return LexoRank.middle().format();
  }
}

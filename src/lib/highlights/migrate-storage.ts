"use client";

/**
 * One-time rewrite of the Year app's stored rows from the feature's old name.
 *
 * The page, its blocks and its tag memberships were first written under
 * `"major-event"`; the feature is now `"highlight"`, and this moves the existing
 * rows over so the app only ever writes one name. It runs on start and does
 * nothing once there is nothing left to move.
 *
 * The registry page's **id** is derived from its kind (`systemPageId` is a
 * `uuidv5` of `kind:user:key`), so it cannot be updated in place: the page is
 * re-inserted under the new id, its blocks are re-pointed, and the old row is
 * deleted. Block and tag rows keep their ids — only their `type`/`entity_kind`
 * change — so links, tags and the search index all survive.
 */

import { systemPageId, type SystemPageKind } from "@/lib/notes/system-pages";
import { db } from "@/lib/powersync/db";
import type { DbContext } from "@/lib/links/links";
import { HIGHLIGHT_STORED_KIND, HIGHLIGHTS_KEY } from "@/lib/highlights/highlights";

/** The names these rows were first written under. Never written again. */
const LEGACY_KIND = "major-event";

export interface HighlightStorageMigrationResult {
  /** Whether a legacy page was found and rewritten. */
  migrated: boolean;
}

export async function migrateHighlightStorage(ctx: DbContext = db): Promise<HighlightStorageMigrationResult> {
  const legacyPages = await ctx.getAll<{
    id: string;
    user_id: string;
    title: string | null;
    properties: string | null;
    created_at: string | null;
    updated_at: string | null;
    deleted_at: string | null;
  }>(
    `SELECT id, user_id, title, properties, created_at, updated_at, deleted_at
       FROM pages
      WHERE json_extract(properties, '$.kind') = ?
        AND json_extract(properties, '$.key') = ?`,
    [LEGACY_KIND, HIGHLIGHTS_KEY],
  );

  if (legacyPages.length === 0) return { migrated: false };

  for (const page of legacyPages) {
    const nextId = systemPageId(page.user_id, HIGHLIGHT_STORED_KIND as SystemPageKind, HIGHLIGHTS_KEY);

    // `OR IGNORE`, not a check-then-insert: two runs can overlap (a double
    // effect, two tabs), and a check followed by an insert lets the loser throw
    // on the unique id *after* the winner has already moved the blocks.
    await ctx.execute(
      `INSERT OR IGNORE INTO pages (id, user_id, title, properties, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nextId,
        page.user_id,
        page.title,
        JSON.stringify({ kind: HIGHLIGHT_STORED_KIND, key: HIGHLIGHTS_KEY }),
        page.created_at,
        page.updated_at,
        page.deleted_at,
      ],
    );

    // Blocks are only ever moved, never deleted: the target page may already
    // hold rows from an overlapping run, and the legacy page's rows are the ones
    // with the tags pointing at them. If the target already has blocks, the
    // legacy page stays where it is and the next launch finishes the job.
    const moved = await ctx.getAll<{ c: number }>(
      "SELECT count(*) AS c FROM blocks WHERE page_id = ?",
      [nextId],
    );
    const targetIsEmpty = (moved[0]?.c ?? 0) === 0;
    if (targetIsEmpty) {
      await ctx.execute("UPDATE blocks SET page_id = ? WHERE page_id = ?", [nextId, page.id]);
      await ctx.execute("DELETE FROM pages WHERE id = ?", [page.id]);
    }
  }

  // Block type and tag membership are values on rows that keep their ids.
  await ctx.execute("UPDATE blocks SET type = ? WHERE type = ?", [HIGHLIGHT_STORED_KIND, LEGACY_KIND]);
  await ctx.execute("UPDATE entity_tags SET entity_kind = ? WHERE entity_kind = ?", [
    HIGHLIGHT_STORED_KIND,
    LEGACY_KIND,
  ]);

  return { migrated: true };
}

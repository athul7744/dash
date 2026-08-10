import { db } from "@/lib/powersync/db";
import { SQL_UTC_NOW_EXPRESSION as NOW } from "@/lib/shared/debounced-update";
import { deleteBookmark } from "@/lib/bookmarks/bookmarks";
import { deleteQuote } from "@/lib/quotes/quotes";
import { deleteEvent, deleteSubjectOccurrences } from "@/lib/events/events";
import { deleteNotePage } from "@/lib/notes/notes";
import { deleteEntityEdges } from "@/lib/links/links";
import { deleteEntityTags } from "@/lib/tags/entity-tags";

/**
 * The shared soft-delete (trash) layer. Deleting anywhere stamps a reversible
 * marker instead of destroying rows — `blocks.deleted_at` / `pages.deleted_at`
 * for the block/note entities, and `tasks.state='trashed'` for tasks (unchanged
 * from the original tasks trash). Relationships (edges/tags/attachments and the
 * occurrence log) are left intact so a restore is lossless; the real cascade runs
 * only on permanent delete (`purgeEntity`, which delegates to the existing
 * hard-delete functions). `updated_at` is always bumped alongside the flag so the
 * search reconciler's watermark catches the change.
 */
export type TrashKind = "bookmark" | "quote" | "event" | "note" | "task";

/**
 * Hide or restore every occurrence logged against a subject, mirroring the
 * subject's own trashed state. A restore only clears occurrences still flagged —
 * individually-deleted occurrences are hard-gone, so a subject's flagged
 * occurrences are exactly the ones this cascade set.
 */
export async function cascadeOccurrences(subjectId: string, deleted: boolean): Promise<void> {
  if (deleted) {
    await db.execute(
      `UPDATE blocks SET deleted_at = ${NOW}, updated_at = ${NOW}
       WHERE type = 'occurrence' AND json_extract(content, '$.subjectId') = ? AND deleted_at IS NULL`,
      [subjectId],
    );
  } else {
    await db.execute(
      `UPDATE blocks SET deleted_at = NULL, updated_at = ${NOW}
       WHERE type = 'occurrence' AND json_extract(content, '$.subjectId') = ? AND deleted_at IS NOT NULL`,
      [subjectId],
    );
  }
}

/** Move an entity to the trash (reversible). */
export async function softDeleteEntity(kind: TrashKind, id: string): Promise<void> {
  switch (kind) {
    case "bookmark":
    case "quote":
    case "event":
      await db.execute(`UPDATE blocks SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ?`, [id]);
      break;
    case "note":
      await db.execute(`UPDATE pages SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ?`, [id]);
      break;
    case "task":
      // Cascades to subtasks in one statement (parent_id = id).
      await db.execute(`UPDATE tasks SET state = 'trashed', updated_at = ${NOW} WHERE id = ? OR parent_id = ?`, [id, id]);
      break;
  }
  await cascadeOccurrences(id, true);
}

/** Restore an entity from the trash. */
export async function restoreEntity(kind: TrashKind, id: string): Promise<void> {
  switch (kind) {
    case "bookmark":
    case "quote":
    case "event":
      await db.execute(`UPDATE blocks SET deleted_at = NULL, updated_at = ${NOW} WHERE id = ?`, [id]);
      break;
    case "note":
      await db.execute(`UPDATE pages SET deleted_at = NULL, updated_at = ${NOW} WHERE id = ?`, [id]);
      break;
    case "task":
      await db.execute(
        `UPDATE tasks SET state = 'pending', updated_at = ${NOW} WHERE (id = ? OR parent_id = ?) AND state = 'trashed'`,
        [id, id],
      );
      break;
  }
  await cascadeOccurrences(id, false);
}

/** Permanently delete an entity — runs the full relationship fan-out. */
export async function purgeEntity(kind: TrashKind, id: string): Promise<void> {
  switch (kind) {
    case "bookmark":
      await deleteBookmark(id);
      break;
    case "quote":
      await deleteQuote(id);
      break;
    case "event":
      await deleteEvent(id);
      break;
    case "note":
      await deleteNotePage(id);
      break;
    case "task":
      await hardDeleteTask(id);
      break;
  }
}

/** Hard-delete a task and its subtasks, severing their relationships. */
async function hardDeleteTask(id: string): Promise<void> {
  const children = await db.getAll<{ id: string }>(`SELECT id FROM tasks WHERE parent_id = ?`, [id]);
  const ids = [id, ...children.map((c) => c.id)];
  await db.execute(`DELETE FROM tasks WHERE id = ? OR parent_id = ?`, [id, id]);
  await Promise.all(ids.map((i) => deleteEntityEdges(i)));
  await Promise.all(ids.map((i) => deleteSubjectOccurrences(i)));
  await Promise.all(ids.map((i) => deleteEntityTags(i)));
}

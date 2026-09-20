"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import type { AttachmentRecord } from "@/lib/powersync/AppSchema";
import { useAttachmentUrl } from "./use-attachment-url";

/** The columns {@link useAttachmentUrl} needs to resolve a viewable URL. */
export type EntityImageRow = Pick<AttachmentRecord, "id" | "file_path" | "sync_state" | "mime_type">;

const COLUMNS = "id, file_path, sync_state, mime_type";
const EMPTY = `SELECT ${COLUMNS}, NULL AS owner FROM attachments WHERE 1 = 0`;

/**
 * First image attachment for each of `entityIds`, keyed by entity id. Batched —
 * call it once per list with all visible ids rather than once per card, the way
 * `useEntityTags` is. Twenty cards each running their own lookup is twenty live
 * queries that all re-run whenever anything writes to `attachments`, and this
 * table grows with every image the app downloads.
 *
 * An entity owns its attachments through `block_id` or `page_id` depending on
 * what it is (a bookmark is a block, a note's banner is a page), and the two are
 * asked separately rather than as one `OR`: an `OR` across two columns makes
 * SQLite give up on both indexes and scan the table, while two branches of a
 * UNION are two index seeks.
 *
 * "First" is by attachment id, matching the single-entity lookup.
 */
export function useEntityImages(entityIds: string[]): Map<string, EntityImageRow> {
  // Stabilize on the sorted distinct id set so the query doesn't re-run when the
  // caller passes a new array with the same members.
  const key = useMemo(
    () => Array.from(new Set(entityIds.filter(Boolean))).sort().join(","),
    [entityIds],
  );
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);

  const placeholders = ids.map(() => "?").join(",");
  const { data = [] } = useQuery<EntityImageRow & { owner: string | null }>(
    ids.length
      ? `SELECT ${COLUMNS}, block_id AS owner FROM attachments WHERE block_id IN (${placeholders}) AND mime_type LIKE 'image/%'
         UNION ALL
         SELECT ${COLUMNS}, page_id AS owner FROM attachments WHERE page_id IN (${placeholders}) AND mime_type LIKE 'image/%'
         ORDER BY id ASC`
      : EMPTY,
    ids.length ? [...ids, ...ids] : [],
  );

  return useMemo(() => {
    const map = new Map<string, EntityImageRow>();
    for (const row of data) {
      if (!row.owner || map.has(row.owner)) continue;
      map.set(row.owner, { id: row.id, file_path: row.file_path, sync_state: row.sync_state, mime_type: row.mime_type });
    }
    return map;
  }, [data]);
}

/**
 * Resolve a viewable URL for one entity's first image attachment. Returns null
 * when there's none or while it resolves. Reactive: appears once the image
 * lands. In a list, use {@link useEntityImages} once and pass each row to
 * {@link useAttachmentUrl} instead.
 */
export function useEntityImage(entityId: string | null | undefined): string | null {
  const ids = useMemo(() => (entityId ? [entityId] : []), [entityId]);
  const images = useEntityImages(ids);
  return useAttachmentUrl((entityId ? images.get(entityId) : null) ?? null);
}

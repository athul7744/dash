"use client";

import { useQuery } from "@powersync/react";

import type { AttachmentRecord } from "@/lib/powersync/AppSchema";
import { useAttachmentUrl } from "./use-attachment-url";

const EMPTY = "SELECT id, file_path, sync_state, mime_type FROM attachments WHERE 1 = 0";

/**
 * Resolve a viewable URL for an entity's (first) image attachment — the preview
 * image on a bookmark card, for example. Returns null when there's none or while
 * it resolves. Reactive: appears once the image lands.
 */
export function useEntityImage(entityId: string | null | undefined): string | null {
  const query = entityId
    ? "SELECT id, file_path, sync_state, mime_type FROM attachments WHERE (block_id = ? OR page_id = ?) AND mime_type LIKE 'image/%' ORDER BY id ASC LIMIT 1"
    : EMPTY;
  const { data = [] } = useQuery<Pick<AttachmentRecord, "id" | "file_path" | "sync_state" | "mime_type">>(
    query,
    entityId ? [entityId, entityId] : [],
  );
  return useAttachmentUrl(data[0] ?? null);
}

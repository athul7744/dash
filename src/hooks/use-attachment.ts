"use client";

import { useQuery } from "@powersync/react";

import type { AttachmentRecord } from "@/lib/powersync/AppSchema";

export type AttachmentRow = Pick<AttachmentRecord, "id" | "file_path" | "sync_state" | "mime_type" | "file_name">;

const SELECT = "SELECT id, file_path, sync_state, mime_type, file_name FROM attachments";
const EMPTY = `${SELECT} WHERE 1 = 0`;

/**
 * Watch one attachment row by id — the lookup an inline note image needs, which
 * carries its attachment id in a node attr rather than an owning entity id.
 * Reactive on `sync_state`, so a pending row that finishes uploading (or one whose
 * bytes arrive on this device) re-resolves. `isLoading` matters to the caller: a
 * missing row means the file is gone, which shouldn't be claimed while the first
 * query is still in flight.
 */
export function useAttachment(id: string | null | undefined): {
  attachment: AttachmentRow | null;
  isLoading: boolean;
} {
  const { data = [], isLoading } = useQuery<AttachmentRow>(
    id ? `${SELECT} WHERE id = ? LIMIT 1` : EMPTY,
    id ? [id] : [],
  );
  return { attachment: data[0] ?? null, isLoading };
}

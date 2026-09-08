"use client";

import { useAttachment } from "@/hooks/use-attachment";
import { useAttachmentUrl } from "@/hooks/use-attachment-url";
import { usePreviewUrl } from "@/hooks/use-preview-url";

export interface ImageSource {
  /** A viewable URL, or null while it resolves or when the bytes can't be had. */
  url: string | null;
  /** The URL is this session's preview, so the browser has already decoded it. */
  isPreview: boolean;
  /** The row lookup hasn't settled — nothing can be concluded from a null url yet. */
  isLoading: boolean;
  /** No row: the file is gone for good, rather than still on its way. */
  isMissing: boolean;
  syncState: string | null;
}

/**
 * Resolve a stored image to something an `<img>` can use.
 *
 * The order is load-bearing and shared by every surface showing a stored image:
 * this session's preview URL first (read during render, so a file stored a moment
 * ago paints immediately and keeps a stable src across document rebuilds), then
 * the id alone (session cache → local blob store) so an image doesn't wait on its
 * row query, then the real row once it arrives — which is what a cross-device
 * download needs. `src` is the fallback for an image not stored at all yet.
 */
export function useImageSource(attachmentId: string | null | undefined, src?: string | null): ImageSource {
  const preview = usePreviewUrl(attachmentId);
  const { attachment, isLoading } = useAttachment(attachmentId);

  const source = preview || !attachmentId
    ? null
    : (attachment ?? { id: attachmentId, file_path: null, sync_state: null });
  const attachmentUrl = useAttachmentUrl(source);

  return {
    url: preview ?? (attachmentId ? attachmentUrl : src ?? null),
    isPreview: Boolean(preview),
    isLoading,
    isMissing: Boolean(attachmentId) && !isLoading && !attachment,
    syncState: attachment?.sync_state ?? null,
  };
}

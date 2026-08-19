"use client";

import { useEffect } from "react";

import { acquirePreviewUrl, previewUrl, releasePreviewUrl } from "@/lib/storage/blob-preview";

/**
 * The session preview URL for an attachment, held for as long as the caller is
 * mounted. Null unless the file was stored this session and is still cached.
 *
 * Read during render, not resolved in an effect, so a file stored a moment ago is
 * on screen in the first paint. The URL is shared and stable per attachment id, so
 * a remount hands the browser a src it has already decoded rather than re-fetching
 * — which is what keeps the notes editor's document rebuilds invisible.
 *
 * Pair with `useAttachmentUrl` for the general case: this covers only the file
 * this session created, that one resolves anything from the local store or Storage.
 */
export function usePreviewUrl(attachmentId: string | null | undefined): string | null {
  const url = previewUrl(attachmentId);

  useEffect(() => {
    if (!attachmentId || !url) return;
    acquirePreviewUrl(attachmentId);
    return () => releasePreviewUrl(attachmentId);
  }, [attachmentId, url]);

  return url;
}

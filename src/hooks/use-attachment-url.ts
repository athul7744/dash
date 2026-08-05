import { useEffect, useState } from "react";

import { resolveUrl } from "@/lib/storage/attachment-sync";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";

type UrlSource = Pick<AttachmentRecord, "id" | "file_path" | "sync_state"> | null | undefined;

/**
 * Resolve a viewable blob URL for an attachment (local cache, else download).
 * Returns null while loading or when the bytes can't be fetched (e.g. a `pending`
 * row whose bytes live on another, still-offline device). Revokes the URL on
 * change/unmount. Re-resolves when the row's id or `sync_state` changes, so a file
 * becomes viewable once its upload lands.
 */
export function useAttachmentUrl(att: UrlSource): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const pending = att ? resolveUrl(att) : Promise.resolve(null);
    void pending.then((resolved) => {
      if (!active) {
        if (resolved) URL.revokeObjectURL(resolved);
        return;
      }
      objectUrl = resolved;
      setUrl(resolved);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att?.id, att?.file_path, att?.sync_state]); // eslint-disable-line react-hooks/exhaustive-deps

  return url;
}

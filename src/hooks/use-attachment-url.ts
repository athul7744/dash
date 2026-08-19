import { useEffect, useRef, useState } from "react";

import { resolveUrl } from "@/lib/storage/attachment-sync";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";

type UrlSource = Pick<AttachmentRecord, "id" | "file_path" | "sync_state"> | null | undefined;

/**
 * Resolve a viewable blob URL for an attachment (session preview, local cache,
 * else download). Returns null while loading or when the bytes can't be fetched
 * (e.g. a `pending` row whose bytes live on another, still-offline device).
 *
 * Re-resolves when the row's `sync_state` changes, so a file becomes viewable once
 * its upload lands. The previous URL is revoked only after the replacement arrives
 * — revoking first would blank the image mid-render. The URL belongs to this hook
 * alone, so nothing else can revoke it while it's on screen.
 */
export function useAttachmentUrl(att: UrlSource): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const pending = att ? resolveUrl(att) : Promise.resolve(null);
    void pending.then((resolved) => {
      if (!active) {
        if (resolved) URL.revokeObjectURL(resolved);
        return;
      }
      const previous = currentRef.current;
      currentRef.current = resolved;
      setUrl(resolved);
      if (previous && previous !== resolved) URL.revokeObjectURL(previous);
    });
    return () => {
      active = false;
    };
  }, [att?.id, att?.file_path, att?.sync_state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release the last resolved URL when the consumer goes away.
  useEffect(
    () => () => {
      if (currentRef.current) URL.revokeObjectURL(currentRef.current);
      currentRef.current = null;
    },
    [],
  );

  return url;
}

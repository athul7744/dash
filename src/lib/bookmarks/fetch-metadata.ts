import { updateBookmark } from "@/lib/bookmarks/bookmarks";
import type { PageMetadata } from "@/lib/bookmarks/metadata";

/**
 * Client-side wrapper over the server metadata proxy (`/api/bookmark-metadata`).
 * Best-effort: returns null on any failure (offline, blocked host, timeout).
 */
export async function fetchBookmarkMetadata(url: string): Promise<Partial<PageMetadata> | null> {
  try {
    const res = await fetch(`/api/bookmark-metadata?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as Partial<PageMetadata>;
  } catch {
    return null;
  }
}

/**
 * Refetch a bookmark's page title from the proxy and persist it when found.
 * Used both when a bookmark is first added and when the user hits "refresh".
 */
export async function refreshBookmarkTitle(id: string, url: string): Promise<void> {
  const meta = await fetchBookmarkMetadata(url);
  const title = meta?.title?.trim();
  if (title) await updateBookmark(id, { title });
}

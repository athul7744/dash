import { updateBookmark } from "@/lib/bookmarks/bookmarks";
import type { PageMetadata } from "@/lib/bookmarks/metadata";
import { attachFile, deleteEntityAttachments } from "@/lib/storage/attachments";

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

/** Store a bookmark's preview image (og:image) as its attachment, replacing any
 * prior one. Fetched through the server image proxy to dodge CORS. Best-effort. */
async function persistBookmarkImage(id: string, imageUrl: string): Promise<void> {
  try {
    const res = await fetch(`/api/bookmark-image?url=${encodeURIComponent(imageUrl)}`);
    if (!res.ok) return;
    const blob = await res.blob();
    if (!blob.size) return;
    await deleteEntityAttachments(id); // one preview per bookmark
    await attachFile(blob, { blockId: id }, { fileName: fileNameFromUrl(imageUrl), mimeType: blob.type });
  } catch {
    /* best-effort — no preview is fine */
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = path.slice(path.lastIndexOf("/") + 1);
    return base || "preview";
  } catch {
    return "preview";
  }
}

/**
 * Refetch a bookmark's page metadata from the proxy: persist the preview image
 * when found, and (when `setTitle`) fill in the title. Used both when a bookmark
 * is first added and when the user hits "refresh". Best-effort throughout.
 */
export async function refreshBookmarkMetadata(
  id: string,
  url: string,
  opts: { setTitle?: boolean } = {},
): Promise<void> {
  const meta = await fetchBookmarkMetadata(url);
  if (!meta) return;
  if (opts.setTitle) {
    const title = meta.title?.trim();
    if (title) await updateBookmark(id, { title });
  }
  const imageUrl = meta.image?.trim();
  if (imageUrl) await persistBookmarkImage(id, imageUrl);
}

/** Refresh title + preview image (existing call sites). */
export async function refreshBookmarkTitle(id: string, url: string): Promise<void> {
  await refreshBookmarkMetadata(id, url, { setTitle: true });
}

/**
 * Client-side helper for pulling a remote image into local storage.
 *
 * The browser can't fetch most remote images directly (CORS), so bytes come
 * through the server proxy at `/api/remote-image`, which is auth-gated,
 * SSRF-guarded, timed out and size-capped. Both callers — bookmark previews and
 * images pasted into a note as a URL — go through here so there's one fetch
 * path to reason about.
 */

/** Fetch a remote image's bytes through the proxy. Null on any failure. */
import { downscaleImage } from "@/lib/storage/downscale";
import { isAllowed } from "@/lib/storage/paths";

export async function fetchRemoteImage(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/remote-image?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/** Drop a trailing extension, so the mime type decides what the key ends in. */
const stripExtension = (name: string) => name.replace(/\.[^.]+$/, "");

/** The file name to store a remote image under: its URL basename, or `fallback`. */
export function imageFileNameFromUrl(url: string, fallback = "image"): string {
  try {
    const path = new URL(url).pathname;
    const base = path.slice(path.lastIndexOf("/") + 1);
    return base || fallback;
  } catch {
    return fallback;
  }
}

/** A remote image pulled in, bounded, and named so its key matches its bytes. */
export interface PreviewImage {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * Fetch a remote preview image and make it ready to store.
 *
 * The one path behind every stored `og:image` — a link card's thumbnail and a
 * bookmark's preview — because all three steps have to agree: pull it through
 * the proxy, bound it so the browser isn't reducing 2400px on every paint (see
 * `downscale.ts`), and drop the original extension when re-encoding changed the
 * format, since `extFor` trusts a file name over the mime type.
 *
 * Null for every ordinary disappointment: no image, a host that won't serve it,
 * something that isn't an image, or one too large to keep.
 */
export async function fetchPreviewImage(imageUrl: string, maxWidth?: number): Promise<PreviewImage | null> {
  const fetched = await fetchRemoteImage(imageUrl);
  if (!fetched) return null;

  const blob = await downscaleImage(fetched, maxWidth);
  const mimeType = blob.type || "image/jpeg";
  if (!mimeType.startsWith("image/") || !isAllowed(mimeType, blob.size)) return null;

  const named = imageFileNameFromUrl(imageUrl, "preview");
  return { blob, mimeType, fileName: blob === fetched ? named : stripExtension(named) };
}

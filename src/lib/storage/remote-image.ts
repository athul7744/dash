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

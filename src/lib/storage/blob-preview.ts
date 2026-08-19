/**
 * Object URLs for files this session stored, held by attachment id.
 *
 * Two things make a freshly stored image render without a flicker, and both live
 * here:
 *
 * - **Immediacy.** Reading bytes back out of the local blob store is
 *   asynchronous, so an image would sit on a placeholder while bytes we had in
 *   hand a moment ago made a round trip through OPFS. The blob stays in memory.
 * - **Identity.** One id maps to one URL string for as long as it's cached. The
 *   editor replaces its whole document whenever rows change, which rebuilds every
 *   `<img>`; handing the browser a src it has already decoded is what keeps that
 *   rebuild invisible. A URL minted per mount would re-fetch and re-decode.
 *
 * A shared URL needs shared ownership, so consumers `acquire`/`release` it and it
 * is revoked only once nothing holds it *and* it has left the cache. Revocation
 * is deferred a tick so a remount that re-acquires cancels it — React's
 * development double-mount does exactly that.
 *
 * Still a cache, not storage: bounded, evicted oldest-first, rebuilt from the
 * blob store on the next page load.
 */

const MAX_ENTRIES = 8;
const MAX_BYTES = 24 * 1024 * 1024;

type Entry = {
  blob: Blob;
  url: string;
  refs: number;
  /** Evicted or deleted: serves no new consumers, dies once released. */
  retired: boolean;
  revoke: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();
let cachedBytes = 0;

/** Keep `id`'s bytes to hand, evicting older entries to stay in budget. */
export function primeBlobPreview(id: string, blob: Blob): void {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  if (entries.has(id)) return;

  entries.set(id, { blob, url: URL.createObjectURL(blob), refs: 0, retired: false, revoke: null });
  cachedBytes += blob.size;

  for (const [oldest, entry] of entries) {
    if (cachedBytes <= MAX_BYTES && cachedCount() <= MAX_ENTRIES) break;
    if (entry.retired) continue;
    if (cachedCount() <= 1) break;
    retire(oldest);
  }
}

/** `id`'s bytes if still cached — for callers that need their own URL. */
export function blobPreview(id: string | null | undefined): Blob | null {
  return live(id)?.blob ?? null;
}

/**
 * The shared URL for `id`, created on demand and stable while cached. Does not
 * claim it: pair the render that reads it with `acquirePreviewUrl` in an effect.
 */
export function previewUrl(id: string | null | undefined): string | null {
  return live(id)?.url ?? null;
}

/** Claim `id`'s URL, keeping it alive until the matching release. */
export function acquirePreviewUrl(id: string | null | undefined): string | null {
  const entry = entries.get(id ?? "");
  if (!entry) return null;
  if (entry.revoke) {
    clearTimeout(entry.revoke);
    entry.revoke = null;
  }
  entry.refs += 1;
  return entry.url;
}

/** Let go of `id`'s URL; a retired entry is revoked once nothing holds it. */
export function releasePreviewUrl(id: string | null | undefined): void {
  const entry = entries.get(id ?? "");
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs === 0 && entry.retired) scheduleRevoke(id!, entry);
}

/** Forget `id` — call when its file is deleted. */
export function dropBlobPreview(id: string): void {
  retire(id);
}

function live(id: string | null | undefined): Entry | null {
  if (!id) return null;
  const entry = entries.get(id);
  return entry && !entry.retired ? entry : null;
}

function cachedCount(): number {
  let n = 0;
  for (const entry of entries.values()) if (!entry.retired) n += 1;
  return n;
}

function retire(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.retired) return;
  entry.retired = true;
  cachedBytes -= entry.blob.size;
  if (entry.refs === 0) scheduleRevoke(id, entry);
}

/**
 * Deferred so a consumer that re-acquires in the same tick — a remount keeping
 * its state — cancels it rather than being left with a dead URL.
 */
function scheduleRevoke(id: string, entry: Entry): void {
  if (entry.revoke) return;
  entry.revoke = setTimeout(() => {
    entries.delete(id);
    URL.revokeObjectURL(entry.url);
  }, 0);
}

/**
 * Pure helpers for the attachment layer — file-path layout, type/size validation,
 * and orphan diffing. No I/O and no `db` import, so this is safe to unit-test and
 * to share between `attachments.ts` (writer) and `attachment-sync.ts` (reconciler).
 */

/** Small-file cap — this layer is for images and documents, not large media. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
]);

/** Whether a file may be stored — enforced client-side; the bucket also caps size. */
export function isAllowed(mime: string, size: number): boolean {
  if (size <= 0 || size > MAX_ATTACHMENT_BYTES) return false;
  return ALLOWED_MIME.has(mime) || mime.startsWith("image/") || mime.startsWith("text/");
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
};

/** File extension for a stored object, from the original name, else the mime type. */
export function extFor(fileName: string, mime: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot > 0 && dot < fileName.length - 1) return fileName.slice(dot + 1).toLowerCase();
  return EXT_BY_MIME[mime] ?? "bin";
}

/** Storage object key: `{userId}/{entityId}/{id}.{ext}` — user id first so RLS and
 * the orphan sweep can scope to a folder. */
export function buildAttachmentPath(
  userId: string,
  entityId: string,
  id: string,
  fileName: string,
  mime: string,
): string {
  return `${userId}/${entityId}/${id}.${extFor(fileName, mime)}`;
}

/** Storage object keys with no matching live row — the ones the sweep removes. */
export function orphanPaths(objects: string[], livePaths: Iterable<string>): string[] {
  const live = new Set(livePaths);
  return objects.filter((p) => !live.has(p));
}

/**
 * The attachment reconciler — the sole maintainer of file bytes.
 *
 * PowerSync syncs the `attachments` rows; it never carries the bytes. This module
 * watches the table and reconciles Storage against it:
 *   - `uploadPending` pushes locally-cached bytes for `pending` rows, then marks
 *     them `synced`.
 *   - `resolveUrl` serves a row: local cache first, else download-and-cache.
 *   - `sweepOrphans` removes Storage objects with no live row — the guaranteed
 *     cascade-delete backstop, robust to offline and scattered delete sites.
 *
 * One `db.onChange` watcher drives it (local writes and synced remote writes
 * both fire), plus an `online` listener. Writers are serialized so two runs never
 * interleave, mirroring the search index.
 */

import { db } from "@/lib/powersync/db";
import { getCurrentUserId } from "@/lib/shared/auth";
import { logger as log } from "@/lib/shared/logger";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";
import { bucket } from "./attachments";
import * as blobStore from "./local-blob-store";
import { persistStorage } from "./local-blob-store";
import { orphanPaths } from "./paths";

const UPLOAD_DEBOUNCE_MS = 500;
const SWEEP_MIN_INTERVAL_MS = 60_000;

let started = false;
let firstSyncDone = false;
let lastSweepAt = 0;

// Serialize every writer so two runs never interleave.
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.catch(() => {}).then(fn);
  chain = next.catch(() => {});
  return next as Promise<T>;
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

// --- Upload pending bytes ---

async function uploadPending(): Promise<void> {
  if (!online()) return;
  const rows = await db.getAll<{ id: string; file_path: string; mime_type: string | null }>(
    "SELECT id, file_path, mime_type FROM attachments WHERE sync_state = 'pending'",
  );
  for (const row of rows) {
    const blob = await blobStore.get(row.id);
    if (!blob) continue; // bytes live on another device — not ours to upload
    log.info(`Attachment upload → ${row.file_path} (${blob.size} bytes)`);
    const { error } = await bucket().upload(row.file_path, blob, {
      contentType: row.mime_type ?? undefined,
      upsert: true,
    });
    if (error) {
      log.warn(`Attachment upload failed (will retry): ${row.file_path}`, error);
      continue;
    }
    await db.execute("UPDATE attachments SET sync_state = 'synced' WHERE id = ?", [row.id]);
    log.info(`Attachment uploaded ✓ ${row.file_path}`);
  }
}

// --- Read path ---

/**
 * Resolve a viewable blob URL for an attachment: the local cache first, else
 * download from Storage and cache it (so it works offline next time). Returns null
 * if the bytes can't be fetched. The caller owns the URL and must revoke it.
 */
export async function resolveUrl(att: Pick<AttachmentRecord, "id" | "file_path">): Promise<string | null> {
  const cached = await blobStore.get(att.id);
  if (cached) return URL.createObjectURL(cached);
  if (!att.file_path || !online()) return null;
  try {
    log.info(`Attachment download → ${att.file_path}`);
    const { data, error } = await bucket().download(att.file_path);
    if (error || !data) {
      log.warn(`Attachment download failed: ${att.file_path}`, error);
      return null;
    }
    await blobStore.put(att.id, data);
    log.info(`Attachment downloaded ✓ ${att.file_path} (${data.size} bytes)`);
    return URL.createObjectURL(data);
  } catch (err) {
    log.warn(`Attachment download failed: ${att.file_path}`, err);
    return null;
  }
}

// --- Orphan sweep (cascade-delete backstop) ---

/** List every object under `{userId}/` (two levels: userId/entityId/file). */
async function listUserObjects(userId: string): Promise<string[]> {
  const b = bucket();
  const entityDirs = await b.list(userId, { limit: 1000 });
  if (entityDirs.error || !entityDirs.data) return [];
  const paths: string[] = [];
  for (const dir of entityDirs.data) {
    // Storage returns folders as entries with a null id; recurse one level.
    if (dir.id) {
      paths.push(`${userId}/${dir.name}`);
      continue;
    }
    const files = await b.list(`${userId}/${dir.name}`, { limit: 1000 });
    if (files.error || !files.data) continue;
    for (const f of files.data) if (f.id) paths.push(`${userId}/${dir.name}/${f.name}`);
  }
  return paths;
}

async function sweepOrphans(): Promise<void> {
  // Never sweep before the first sync — the local `attachments` table may still be
  // empty while objects exist, and we'd wrongly delete live files.
  if (!firstSyncDone || !online()) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  lastSweepAt = Date.now();

  const objects = await listUserObjects(userId);
  if (objects.length === 0) return;
  const liveRows = await db.getAll<{ file_path: string }>("SELECT file_path FROM attachments");
  const orphans = orphanPaths(objects, liveRows.map((r) => r.file_path));
  if (orphans.length === 0) return;
  log.info(`Attachment sweep → removing ${orphans.length} orphaned file(s)`, orphans);
  const { error } = await bucket().remove(orphans);
  if (error) log.warn("Attachment sweep remove failed", error, orphans);
  else log.info(`Attachment sweep removed ✓ ${orphans.length} file(s)`);
}

// --- Wiring ---

let uploadTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleUpload() {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => void enqueue(uploadPending), UPLOAD_DEBOUNCE_MS);
}
function scheduleSweep() {
  if (Date.now() - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return;
  void enqueue(sweepOrphans);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  void persistStorage();
  db.onChangeWithCallback(
    {
      onChange: () => {
        scheduleUpload();
        scheduleSweep();
      },
      onError: (e) => log.warn("Attachment reconciler watch error", e),
    },
    { tables: ["attachments"], throttleMs: 500 },
  );
  window.addEventListener("online", () => {
    void enqueue(uploadPending);
    scheduleSweep();
  });
}

/** Local open: start watching and push any bytes left pending from a prior session. */
export function primeAttachmentsLocal(): void {
  start();
  void enqueue(uploadPending);
}

/** After the first cloud sync: uploads are safe, and the sweep can run. */
export async function syncAttachmentsAfterSync(): Promise<void> {
  start();
  try {
    await db.waitForFirstSync();
  } catch {
    return; // offline / aborted — nothing confirmed yet
  }
  firstSyncDone = true;
  await enqueue(uploadPending);
  void enqueue(sweepOrphans);
}

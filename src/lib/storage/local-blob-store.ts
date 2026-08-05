/**
 * A disposable local blob cache keyed by attachment id.
 *
 * It holds the bytes for files that are either waiting to upload (offline /
 * pending) or already downloaded for viewing. It is never a source of truth — a
 * browser eviction or `resetLocalDatabase` can wipe it, and every reader tolerates
 * a miss by re-downloading from Storage. OPFS is used when present (fast, real
 * files); otherwise an IndexedDB object store holds the blobs.
 */

import { logger as log } from "@/lib/shared/logger";

const DIR = "attachments";
const IDB_NAME = "attachment-blobs";
const IDB_STORE = "blobs";

type Backend = "opfs" | "idb" | "none";

let backend: Backend | null = null;

function opfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === "function" &&
    typeof FileSystemFileHandle !== "undefined" &&
    // Safari exposes getDirectory but not the writable stream we need.
    typeof (FileSystemFileHandle.prototype as unknown as { createWritable?: unknown }).createWritable === "function"
  );
}

async function resolveBackend(): Promise<Backend> {
  if (backend) return backend;
  if (typeof window === "undefined") return (backend = "none");
  if (opfsAvailable()) {
    try {
      await navigator.storage.getDirectory();
      return (backend = "opfs");
    } catch {
      /* fall through to IndexedDB */
    }
  }
  backend = typeof indexedDB !== "undefined" ? "idb" : "none";
  return backend;
}

/** Ask the browser to keep our storage from being evicted under pressure. */
export async function persistStorage(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch (err) {
    log.warn("navigator.storage.persist() failed", err);
  }
}

// --- OPFS ---

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

async function opfsPut(id: string, blob: Blob): Promise<void> {
  const dir = await opfsDir();
  const handle = await dir.getFileHandle(id, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function opfsGet(id: string): Promise<Blob | null> {
  try {
    const dir = await opfsDir();
    const handle = await dir.getFileHandle(id, { create: false });
    return await handle.getFile();
  } catch {
    return null;
  }
}

async function opfsRemove(id: string): Promise<void> {
  try {
    const dir = await opfsDir();
    await dir.removeEntry(id);
  } catch {
    /* already gone */
  }
}

// --- IndexedDB ---

let idbPromise: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}

function idbTx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return idb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const tx = database.transaction(IDB_STORE, mode);
        const req = run(tx.objectStore(IDB_STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- Public API (backend-agnostic) ---

export async function put(id: string, blob: Blob): Promise<void> {
  const b = await resolveBackend();
  if (b === "opfs") return opfsPut(id, blob);
  if (b === "idb") {
    await idbTx("readwrite", (store) => store.put(blob, id));
    return;
  }
}

export async function get(id: string): Promise<Blob | null> {
  const b = await resolveBackend();
  if (b === "opfs") return opfsGet(id);
  if (b === "idb") return (await idbTx<Blob | undefined>("readonly", (store) => store.get(id))) ?? null;
  return null;
}

export async function has(id: string): Promise<boolean> {
  return (await get(id)) !== null;
}

export async function remove(id: string): Promise<void> {
  const b = await resolveBackend();
  if (b === "opfs") return opfsRemove(id);
  if (b === "idb") {
    await idbTx("readwrite", (store) => store.delete(id));
    return;
  }
}

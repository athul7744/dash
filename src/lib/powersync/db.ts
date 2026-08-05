import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './AppSchema';
import { SupabaseConnector } from './SupabaseConnector';
import { logger as log } from '../shared/logger';
import { ensureSearchIndex, primeSearchIndexLocal, buildSearchIndexAfterSync, resetSearchIndex } from '../search/search-index';
import { primeAttachmentsLocal, syncAttachmentsAfterSync } from '../storage/attachment-sync';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'todo-app.sqlite'
  }
});

let isLocalReady = false;
let isCloudConnected = false;

/** Phase 1: Open local SQLite — fast, no network. UI can render after this. */
export const initLocal = async () => {
  if (isLocalReady || typeof window === 'undefined') return;
  isLocalReady = true;
  log.info("Initializing local SQLite database...");
  await db.init();
  log.info("Local database ready");
  // Open the local search index and catch up any offline edits (never blocks UI).
  await ensureSearchIndex();
  void primeSearchIndexLocal();
  // Start the attachment reconciler and flush any bytes left pending offline.
  primeAttachmentsLocal();
};

/** Phase 2: Connect to PowerSync cloud — runs in background, doesn't block UI. */
export const connectCloud = async () => {
  if (isCloudConnected || typeof window === 'undefined') return;
  isCloudConnected = true;
  log.info("Connecting to PowerSync cloud...");
  const connector = new SupabaseConnector();
  await db.connect(connector, {
    crudUploadThrottleMs: 2000,
    retryDelayMs: 5000
  });
  log.info("Cloud connection established");
  // Build the search index once after the first sync, then keep it live.
  void buildSearchIndexAfterSync();
  // Enable attachment uploads + the orphan sweep once the first sync confirms.
  void syncAttachmentsAfterSync();
};

/** Disconnect and reconnect to PowerSync cloud. */
export const reconnectCloud = async () => {
  if (typeof window === 'undefined') return;
  log.info("Reconnecting to cloud...");
  await db.disconnect();
  isCloudConnected = false;
  await connectCloud();
};

/** Delete local SQLite database and re-sync all data from the cloud. */
export const resetLocalDatabase = async () => {
  if (typeof window === 'undefined') return;
  log.info("Resetting local database...");
  // Drop the search index while the DB is still open — it's not PowerSync-managed,
  // so disconnectAndClear leaves it behind and the rebuild would otherwise be skipped.
  await resetSearchIndex();
  // Disconnect from cloud sync
  await db.disconnect();
  log.info("Disconnected from cloud");
  // Delete all local data
  await db.disconnectAndClear();
  log.info("Local data cleared");
  // Reset flags so we can re-initialize
  isLocalReady = false;
  isCloudConnected = false;
  // Re-initialize
  await initLocal();
  await connectCloud();
  log.info("Reset complete — re-syncing from cloud");
};

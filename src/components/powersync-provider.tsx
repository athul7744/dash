"use client"

import React, { useEffect, useState } from 'react';
import { PowerSyncContext } from '@powersync/react';
import { db, initLocal, connectCloud } from '@/lib/powersync/db';
import { logger } from '@/lib/shared/logger';
import { AppBootSkeleton } from '@/components/AppBootSkeleton';

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const [localReady, setLocalReady] = useState(false);

  useEffect(() => {
    // Phase 1: Open local DB (fast, ~50ms) → render UI with cached data
    initLocal()
      .then(() => {
        setLocalReady(true);
        // Phase 2: Connect to cloud in background — doesn't block UI
        connectCloud().catch((err) =>
          logger.error("PowerSync cloud connect failed:", err)
        );
      })
      .catch((err) => logger.error("Failed to initialize local DB:", err));
  }, []);

  // Render inside the context so the boot skeleton's chrome (SyncIndicator via
  // useStatus, AppHeader) works while the DB opens. Children mount only once
  // localReady, keeping the client-only subtree SSR-safe (see use-greeting.ts).
  return (
    <PowerSyncContext.Provider value={db}>
      {localReady ? children : <AppBootSkeleton />}
    </PowerSyncContext.Provider>
  );
}

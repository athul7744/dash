"use client";

import { useEffect } from "react";

import { migrateHighlightStorage } from "@/lib/highlights/migrate-storage";
import { logger } from "@/lib/shared/logger";

/**
 * Runs {@link migrateHighlightStorage} once per launch, after the local database
 * is open. Silent by design: it is a no-op for anyone who never stored a
 * highlight under the old name, and for everyone else it moves rows before any
 * screen reads them.
 */
export function HighlightStorageMigration() {
  useEffect(() => {
    let cancelled = false;
    void migrateHighlightStorage()
      .then((result) => {
        if (!cancelled && result.migrated) logger.info("Moved highlights to their new stored kind.");
      })
      .catch((error) => logger.error("Highlight storage migration failed:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

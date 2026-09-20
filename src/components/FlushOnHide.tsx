"use client";

/**
 * Writes what's still in memory the moment the app goes away.
 *
 * Edits are debounced before they reach SQLite — a second for a field, longer
 * for a note's body — so at any instant the newest keystrokes exist only in a
 * pending timer. Something has to land them when the app stops being visible.
 *
 * `beforeunload` is not that something. It fires when a *tab* is closed, which
 * is not how an installed app ends: a phone backgrounds it and the OS reclaims
 * it later, with no unload of any kind, and iOS standalone barely fires the
 * event at all. Anything relying on it loses whatever was mid-debounce, which
 * reads as "my offline edits vanished" — the loss happened on the way out, not
 * on the way back.
 *
 * `visibilitychange → hidden` is the last event the platform guarantees, and
 * `pagehide` covers the back/forward cache. Both are idempotent here: flushing
 * with nothing pending does nothing.
 *
 * Mounted once, below PowerSync so the database exists. Renders nothing.
 */

import { useEffect } from "react";

import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { flushAllUpdates, hasPendingWrites } from "@/lib/shared/debounced-update";

export function FlushOnHide() {
  useEffect(() => {
    const flush = () => {
      // The editors' own persisters are separate from the field-level queue, and
      // a note's body lives in the first — so both, always.
      void flushAllBlockDocumentPersisters();
      if (hasPendingWrites()) void flushAllUpdates();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      // Unmounting is the app going away in every sense that matters here.
      flush();
    };
  }, []);

  return null;
}

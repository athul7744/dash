"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_OVERVIEW_VIEW,
  OVERVIEW_VIEW_STORAGE_KEY,
  isOverviewView,
  type OverviewView,
} from "@/lib/notes/overview-view";

const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): OverviewView {
  const stored = localStorage.getItem(OVERVIEW_VIEW_STORAGE_KEY);
  return isOverviewView(stored) ? stored : DEFAULT_OVERVIEW_VIEW;
}

function getServerSnapshot(): OverviewView {
  return DEFAULT_OVERVIEW_VIEW;
}

/**
 * Reads/writes the selected notes-overview layout. Mirrors `use-display-font`:
 * `useSyncExternalStore` keeps the hydration snapshot matching the server default
 * and persists changes to localStorage. The notes subtree is client-only (gated
 * by PowerSyncProvider), so no pre-paint script is needed.
 */
export function useNotesOverviewView() {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setView = useCallback((next: OverviewView) => {
    try {
      localStorage.setItem(OVERVIEW_VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { view, setView };
}

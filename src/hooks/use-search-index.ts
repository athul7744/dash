"use client";

import { useSyncExternalStore } from "react";

import {
  subscribeSearchIndex,
  getSearchIndexSnapshot,
  getSearchIndexServerSnapshot,
  type SearchIndexSnapshot,
} from "@/lib/search/search-index";

/** Live snapshot of the search index build (status + progress counters). */
export function useSearchIndexProgress(): SearchIndexSnapshot {
  return useSyncExternalStore(subscribeSearchIndex, getSearchIndexSnapshot, getSearchIndexServerSnapshot);
}

/** True once the FTS index is built and queryable; drives the FTS-vs-fallback choice. */
export function useSearchIndexReady(): boolean {
  return useSearchIndexProgress().status === "ready";
}

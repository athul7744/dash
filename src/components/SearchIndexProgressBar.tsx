"use client";

import { useSearchIndexProgress } from "@/hooks/use-search-index";

/**
 * A hairline progress bar for the one-time search-index build. It rides the
 * header's bottom border and only shows while the index is building — the engine
 * holds that state a minimum span (see MIN_BUILDING_MS) so a fast build still
 * paints a visible sweep. The rest of the time it renders nothing. The index is a
 * disposable cache, so this is purely informational; search keeps working (on the
 * JS fallback) meanwhile.
 */
export function SearchIndexProgressBar() {
  const { status, done, total } = useSearchIndexProgress();
  if (status !== "building") return null;

  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      role="progressbar"
      aria-label="Building search index"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      title={`Building search index… ${done}/${total}`}
    >
      <div
        className="h-full bg-violet-500 transition-[width] duration-300 ease-out dark:bg-violet-400"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

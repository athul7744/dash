"use client";

import { ProgressBar } from "@/components/ui/progress-bar";
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

  return (
    <ProgressBar
      done={done}
      total={total}
      label="Building search index"
      className="pointer-events-none absolute inset-x-0 bottom-0 rounded-none bg-transparent"
    />
  );
}

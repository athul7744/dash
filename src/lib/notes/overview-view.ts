/**
 * The notes overview offers three layouts the user switches between; the choice
 * is persisted in localStorage (see `src/hooks/use-notes-overview-view.ts`).
 *
 * - `rows`    — dense, scannable list rows with inline metadata.
 * - `gallery` — borderless, airy cards (the default; closest to the old grid).
 * - `spine`   — recency timeline with favorites pinned on top.
 */
export type OverviewView = "rows" | "gallery" | "spine";

export const DEFAULT_OVERVIEW_VIEW: OverviewView = "gallery";

export const OVERVIEW_VIEW_STORAGE_KEY = "notes-overview-view";

export const OVERVIEW_VIEWS: { value: OverviewView; label: string }[] = [
  { value: "rows", label: "List" },
  { value: "gallery", label: "Gallery" },
  { value: "spine", label: "Timeline" },
];

export function isOverviewView(value: unknown): value is OverviewView {
  return typeof value === "string" && OVERVIEW_VIEWS.some((v) => v.value === value);
}

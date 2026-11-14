import { cancelUpdate, debouncedUpdate } from "@/lib/shared/debounced-update";

/**
 * Move a task between done and not, recording *when* it was finished.
 *
 * Both halves belong together: `completed_at` is what the Day surface reads for
 * "finished on this day", and `updated_at` can't stand in for it — any later
 * edit moves that. Every surface that ticks a task goes through here so none of
 * them can write one without the other.
 *
 * The column is nullable, and tasks ticked before it existed carry nothing, so
 * anything ordering or displaying by it has to handle NULL rather than assume
 * every completed row has a timestamp.
 */
export function setTaskState(id: string, nextState: string) {
  debouncedUpdate(id, "state", nextState);
  debouncedUpdate(id, "completed_at", nextState === "completed" ? new Date().toISOString() : null);
}

/** Drop a pending state write for a task (it never changed after all). */
export function cancelTaskStateWrite(id: string) {
  cancelUpdate(id, "state");
  cancelUpdate(id, "completed_at");
}

/**
 * Priority color definitions for task indicators.
 */
export const PRIORITY_COLORS: Record<string, { bg: string; ring: string }> = {
  low: { bg: "bg-sky-500", ring: "ring-sky-500/30" },
  medium: { bg: "bg-amber-500", ring: "ring-amber-500/30" },
  high: { bg: "bg-orange-500", ring: "ring-orange-500/30" },
  urgent: { bg: "bg-red-600", ring: "ring-red-600/30" },
};

export const PRIORITY_LEVELS = Object.keys(PRIORITY_COLORS) as Array<keyof typeof PRIORITY_COLORS>;

export type TaskPriority = (typeof PRIORITY_LEVELS)[number];

/**
 * Read a stored priority, falling back to `medium` for null/blank — and for any
 * value the rows predate, which is why this validates instead of casting.
 */
export function asTaskPriority(value: string | null | undefined): TaskPriority {
  return PRIORITY_LEVELS.includes(value as TaskPriority) ? (value as TaskPriority) : "medium";
}

/**
 * Normalize a user-entered link: trim it and prepend `https://` when no scheme
 * is present. Returns "" for empty input.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Parse a link's hostname, normalizing scheme first. Returns null if invalid.
 */
export function getLinkHost(raw: string): string | null {
  const normalized = normalizeUrl(raw);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname || null;
  } catch {
    return null;
  }
}

/**
 * Find the first URL inside a block of free text — an `http(s)://…` or bare
 * `www.…` token — trims trailing punctuation, and returns it normalized (so
 * `www.` gets a scheme). Returns null when no valid URL is found.
 */
export function extractFirstUrl(text: string): string | null {
  const match = (text || "").match(/(?:https?:\/\/|www\.)[^\s]+/i);
  if (!match) return null;
  const candidate = match[0].replace(/[.,;:!?)\]}>"']+$/, "");
  return getLinkHost(candidate) ? normalizeUrl(candidate) : null;
}

/**
 * Orders the task list. Each one ends in `id ASC` on purpose: the list pages
 * with `LIMIT`, so a non-total order would let "load more" skip rows or show
 * one twice as the window grows.
 */
export type TaskSort = "due" | "priority" | "created" | "title";

export const TASK_SORT_OPTIONS: ReadonlyArray<{ value: TaskSort; label: string }> = [
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title A–Z" },
];

// Ranked from the same list the priority dots render from, so a new level can't
// exist in the UI without the order knowing about it.
const PRIORITY_RANK = `CASE priority ${[...PRIORITY_LEVELS]
  .reverse()
  .map((level, rank) => `WHEN '${level}' THEN ${rank}`)
  .join(" ")} ELSE ${PRIORITY_LEVELS.length} END`;
const UNDATED_LAST = `CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END`;

/** Narrow an arbitrary `?sort=` value to a known sort, so a stale URL can't reach SQL. */
export function isTaskSort(value: string | null | undefined): value is TaskSort {
  return TASK_SORT_OPTIONS.some((option) => option.value === value);
}

export function buildTaskOrderBy(sort: TaskSort): string {
  switch (sort) {
    case "priority":
      return `${PRIORITY_RANK} ASC, ${UNDATED_LAST}, due_date ASC, id ASC`;
    case "created":
      return `created_at DESC, id ASC`;
    case "title":
      return `title COLLATE NOCASE ASC, id ASC`;
    case "due":
    default:
      return `${UNDATED_LAST}, due_date ASC, ${PRIORITY_RANK} ASC, id ASC`;
  }
}

/**
 * Compute due date display info from a Date object.
 */
export function getDueDateInfo(dueDate: Date | undefined): {
  show: boolean;
  bg: string;
  text: string;
  label: string;
} {
  if (!dueDate) {
    return { show: false, bg: "", text: "", label: "" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      show: true,
      bg: "bg-red-500/20 dark:bg-red-900/40",
      text: "text-red-700 dark:text-red-400 font-bold",
      label: "Overdue",
    };
  }
  if (diffDays === 0) {
    return {
      show: true,
      bg: "bg-red-500/10 dark:bg-red-500/20",
      text: "text-red-600 dark:text-red-400 font-bold",
      label: "Due Today",
    };
  }
  if (diffDays <= 2) {
    return {
      show: true,
      bg: "bg-orange-500/10 dark:bg-orange-500/20",
      text: "text-orange-600 dark:text-orange-400 font-semibold",
      label: `Due in ${diffDays} ${diffDays === 1 ? "Day" : "Days"}`,
    };
  }
  return {
    show: true,
    bg: "bg-green-500/10 dark:bg-green-500/20",
    text: "text-green-600 dark:text-green-400 font-medium",
    label: `Due in ${diffDays} Days`,
  };
}
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
      label: `Due in ${diffDays} Days`,
    };
  }
  return {
    show: true,
    bg: "bg-green-500/10 dark:bg-green-500/20",
    text: "text-green-600 dark:text-green-400 font-medium",
    label: `Due in ${diffDays} Days`,
  };
}
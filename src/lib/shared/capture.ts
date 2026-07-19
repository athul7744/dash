import { getLinkHost } from "@/lib/tasks/tasks";
import { resolveSharedLink, type IncomingSharePayload } from "@/lib/shared/share";

/**
 * Pure content classification for the universal capture flow. No DB imports, so
 * it stays cheap and unit-testable (the DB dispatch lives in capture-actions.ts).
 */

export type CaptureTarget = "bookmark" | "quote" | "task" | "note";
export type Platform = "youtube" | "instagram" | "x" | "reddit" | "github" | null;

export const PLATFORM_LABELS: Record<NonNullable<Platform>, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
  reddit: "Reddit",
  github: "GitHub",
};

/** Recognize a few common content platforms from a URL's host. */
export function detectPlatform(url: string): Platform {
  const host = getLinkHost(url)?.toLowerCase() ?? "";
  if (!host) return null;
  if (host === "youtu.be" || /(^|\.)youtube\.com$/.test(host)) return "youtube";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)reddit\.com$/.test(host)) return "reddit";
  if (/(^|\.)github\.com$/.test(host)) return "github";
  return null;
}

const QUOTE_MAX_LENGTH = 280;

/** Short, single-paragraph, or explicitly-quoted text reads as a quote. */
export function looksLikeQuote(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > QUOTE_MAX_LENGTH) return false;
  if (/\n\s*\n/.test(t)) return false; // multiple paragraphs → prose (note)
  if (/^["“'']/.test(t) && /["”'']$/.test(t)) return true; // wrapped in quotes
  return t.length <= 200; // short prose → quote-ish
}

export interface Classification {
  /** Smart default destination; the user can always re-route. */
  target: CaptureTarget;
  /** Resolved URL (from url param, or first URL in text/title). "" when none. */
  link: string;
  /** Recognized platform for a link, else null. */
  platform: Platform;
}

/**
 * Pick a smart default target for a shared payload:
 * - has a URL  → bookmark (with platform)
 * - text only  → quote if it reads like one, else note
 */
export function classifyShare(payload: IncomingSharePayload): Classification {
  const link = resolveSharedLink(payload);
  if (link) {
    return { target: "bookmark", link, platform: detectPlatform(link) };
  }
  const text = (payload.text || payload.title).trim();
  return { target: looksLikeQuote(text) ? "quote" : "note", link: "", platform: null };
}

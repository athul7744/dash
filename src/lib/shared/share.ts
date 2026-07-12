import { extractFirstUrl, getLinkHost } from "@/lib/tasks/tasks";

interface SearchParamReader {
  get(name: string): string | null;
}

export interface IncomingSharePayload {
  title: string;
  text: string;
  url: string;
}

const TASK_TITLE_MAX_LENGTH = 250;

function normalizeShareValue(value: string | null): string {
  return value?.replace(/\r\n/g, "\n").trim() ?? "";
}

function clampTaskTitle(value: string): string {
  if (value.length <= TASK_TITLE_MAX_LENGTH) return value;
  return `${value.slice(0, TASK_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

export function readIncomingSharePayload(params: SearchParamReader): IncomingSharePayload {
  return {
    title: normalizeShareValue(params.get("title")),
    text: normalizeShareValue(params.get("text")),
    url: normalizeShareValue(params.get("url")),
  };
}

/**
 * Resolve the URL to attach as the task link from a share payload. Prefers the
 * dedicated `url` param, then the first URL embedded in `text`, then `title`.
 * Returns "" when none is found.
 */
export function resolveSharedLink(payload: IncomingSharePayload): string {
  if (getLinkHost(payload.url)) return payload.url;
  return extractFirstUrl(payload.text) ?? extractFirstUrl(payload.title) ?? "";
}

export function buildSharedTaskTitle(
  payload: IncomingSharePayload,
  opts?: { excludeUrl?: string }
): string {
  const exclude = opts?.excludeUrl;
  // Remove the excluded URL line-by-line: collapse leftover spaces within a line
  // and drop any line that becomes empty, while preserving remaining newlines.
  const strip = (value: string) =>
    exclude
      ? value
          .split("\n")
          .map((line) => line.split(exclude).join("").replace(/\s{2,}/g, " ").trim())
          .filter((line) => line !== "")
          .join("\n")
      : value;

  const parts: string[] = [];
  const title = strip(payload.title);
  const text = strip(payload.text);

  if (title) parts.push(title);
  if (text && text !== title) parts.push(text);
  // Only append the bare URL as its own line when we're not pulling it into the link field.
  if (!exclude && payload.url && !parts.some((part) => part.includes(payload.url))) parts.push(payload.url);

  return clampTaskTitle(parts.join("\n\n").trim() || "Shared item");
}

export function sanitizeNextPath(next: string | null, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) {
    return fallback;
  }
  return next;
}
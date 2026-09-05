import { createBookmark } from "@/lib/bookmarks/bookmarks";
import { refreshBookmarkMetadata } from "@/lib/bookmarks/fetch-metadata";
import { createNoteFromText } from "@/lib/notes/notes";
import { createQuote } from "@/lib/quotes/quotes";
import type { CaptureTarget } from "@/lib/shared/capture";
import { createTask } from "@/lib/tasks/create-task";

/** Fields a capture can carry; only those relevant to `target` are used. */
export interface CaptureInput {
  target: CaptureTarget;
  url?: string;
  title?: string;
  note?: string;
  text?: string;
  author?: string;
  link?: string;
  dueDate?: Date;
  tags?: string[];
  priority?: "low" | "medium" | "high" | "urgent";
}

/**
 * The triage's shared field model. One set of fields backs every target, so a
 * value survives switching between them (a shared URL is a bookmark's address, a
 * task's link, and a quote's source).
 */
export interface CaptureFields {
  url: string;
  title: string;
  text: string;
  author: string;
  dueDate?: Date;
  tags: string[];
}

/** Pick the fields the chosen target actually stores. */
export function buildCaptureInput(target: CaptureTarget, fields: CaptureFields): CaptureInput {
  const { url, title, text, author, dueDate, tags } = fields;
  switch (target) {
    case "bookmark":
      return { target, url, title, note: text, tags };
    case "quote":
      return { target, text, author, link: url };
    case "task":
      return { target, title, link: url, dueDate, tags };
    case "note":
      return { target, title, text };
  }
}

export interface CaptureResult {
  /** App id from the registry (bookmarks/quotes/tasks/notes). */
  appId: string;
  itemId: string;
}

/**
 * Persist a capture into the chosen app. Writes to local PowerSync (offline-safe;
 * syncs later). For bookmarks with no user-supplied title, kicks off the async
 * OG-title fetch so it fills in when online.
 */
export async function saveCapture(input: CaptureInput): Promise<CaptureResult> {
  switch (input.target) {
    case "bookmark": {
      const url = input.url ?? "";
      const itemId = await createBookmark({ url, title: input.title, note: input.note, tags: input.tags });
      // Always fetch the preview image; fill the title only when none was given.
      if (url) void refreshBookmarkMetadata(itemId, url, { setTitle: !input.title?.trim() });
      return { appId: "bookmarks", itemId };
    }
    case "quote": {
      // A shared/pasted URL becomes the quote's source link.
      const itemId = await createQuote({ text: input.text, author: input.author, link: input.link ?? input.url });
      return { appId: "quotes", itemId };
    }
    case "task": {
      const itemId = await createTask({
        title: input.title ?? "",
        link: input.link,
        dueDate: input.dueDate,
        tags: input.tags,
        priority: input.priority,
      });
      return { appId: "tasks", itemId };
    }
    case "note": {
      const itemId = await createNoteFromText(input.title || "Captured note", input.text ?? "");
      return { appId: "notes", itemId };
    }
  }
}

/** Deep link to the saved item's app. */
export function captureResultHref(result: CaptureResult): string {
  return result.appId === "notes" ? `/notes/${result.itemId}` : `/${result.appId}`;
}

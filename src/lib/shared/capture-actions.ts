import { createBookmark } from "@/lib/bookmarks/bookmarks";
import { refreshBookmarkTitle } from "@/lib/bookmarks/fetch-metadata";
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
      if (url && !input.title?.trim()) void refreshBookmarkTitle(itemId, url);
      return { appId: "bookmarks", itemId };
    }
    case "quote": {
      const itemId = await createQuote({ text: input.text, author: input.author });
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

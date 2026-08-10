"use client";

import { useMemo } from "react";
import { useQuery } from "@powersync/react";

import type { TrashKind } from "@/lib/shared/trash";
import { parseBookmarkContent } from "@/lib/bookmarks/bookmarks";
import { parseQuoteContent } from "@/lib/quotes/quotes";
import { parseEventContent } from "@/lib/events/events";

export interface TrashedItem {
  id: string;
  kind: TrashKind;
  label: string;
  updatedAt: string | null;
}

type BlockRow = { id: string; type: string; content: string | null; updated_at: string | null };
type PageRow = { id: string; title: string | null; updated_at: string | null };
type TaskRow = { id: string; title: string | null; updated_at: string | null };

function blockLabel(type: string, content: string | null): string {
  switch (type) {
    case "bookmark": {
      const b = parseBookmarkContent(content);
      return b.title || b.url || "Untitled bookmark";
    }
    case "quote": {
      const q = parseQuoteContent(content);
      return q.text || "Untitled quote";
    }
    case "event": {
      const e = parseEventContent(content);
      return e.title || "Untitled event";
    }
    default:
      return "Untitled";
  }
}

/**
 * Everything currently in the trash, across apps — the reactive source for the
 * `/trash` page. Trashed bookmark/quote/event blocks (by their own `type`),
 * soft-deleted note pages (real pages, not system pages), and trashed top-level
 * tasks. Occurrences are excluded (they ride their subject). Newest first.
 */
export function useTrashedItems(): { items: TrashedItem[]; isLoading: boolean } {
  const { data: blocks = [], isLoading: l1 } = useQuery<BlockRow>(
    `SELECT id, type, content, updated_at FROM blocks
     WHERE deleted_at IS NOT NULL AND type IN ('bookmark','quote','event')
     ORDER BY updated_at DESC`,
  );
  const { data: pages = [], isLoading: l2 } = useQuery<PageRow>(
    `SELECT id, title, updated_at FROM pages
     WHERE deleted_at IS NOT NULL AND json_extract(properties, '$.kind') IS NULL
     ORDER BY updated_at DESC`,
  );
  const { data: tasks = [], isLoading: l3 } = useQuery<TaskRow>(
    `SELECT id, title, updated_at FROM tasks
     WHERE state = 'trashed' AND parent_id IS NULL
     ORDER BY updated_at DESC`,
  );

  const items = useMemo<TrashedItem[]>(() => {
    const merged: TrashedItem[] = [
      ...blocks.map((b) => ({ id: b.id, kind: b.type as TrashKind, label: blockLabel(b.type, b.content), updatedAt: b.updated_at })),
      ...pages.map((p) => ({ id: p.id, kind: "note" as TrashKind, label: p.title || "Untitled page", updatedAt: p.updated_at })),
      ...tasks.map((t) => ({ id: t.id, kind: "task" as TrashKind, label: t.title || "Untitled task", updatedAt: t.updated_at })),
    ];
    return merged.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [blocks, pages, tasks]);

  return { items, isLoading: l1 || l2 || l3 };
}

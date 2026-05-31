"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useQuery } from "@powersync/react";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { TagPillStrip } from "@/components/tags/TagPillStrip";
import { useNoteBlocks } from "@/hooks/use-notes";
import type { NoteBlockRow } from "@/hooks/use-notes";
import type { Tag as TagRecord } from "@/lib/powersync/AppSchema";
import { buildNoteBlockTree, type NoteTreeNode } from "@/lib/notes/notes-tree";
import { ReadOnlyBlockRenderer, type ReadOnlyBlockData } from "./ReadOnlyBlockRenderer";
import type { PeekTarget } from "./usePagePeek";

type PagePeekPage = {
  id: string;
  title: string;
  properties: string | null;
};

function parseProperties(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function buildReadOnlyTree(tree: NoteTreeNode<NoteBlockRow>[]): ReadOnlyBlockData[] {
  return tree.map((node) => ({
    id: node.block.id,
    type: node.block.type,
    content: node.block.content,
    children: node.children.length > 0 ? buildReadOnlyTree(node.children) : undefined,
  }));
}

function usePageByTitle(title: string | null) {
  const query = title
    ? "SELECT id, title, properties FROM pages WHERE title = ? COLLATE NOCASE LIMIT 1"
    : "SELECT id, title, properties FROM pages WHERE 1 = 0";
  const args = title ? [title] : [];
  const { data = [], isLoading } = useQuery<PagePeekPage>(query, args);
  return { page: data[0] ?? null, isLoading };
}

export function PagePeekPopover({
  target,
  onClose,
  onNavigate,
}: {
  target: PeekTarget;
  onClose: () => void;
  onNavigate: (title: string) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const { page, isLoading: isLoadingPage } = usePageByTitle(target.pageTitle);
  const { blocks, isLoading: isLoadingBlocks } = useNoteBlocks(page?.id);
  const { data: allTags = [] } = useQuery<TagRecord & { id: string }>("SELECT id, name, color FROM tags ORDER BY name ASC");

  const properties = useMemo(() => parseProperties(page?.properties ?? null), [page?.properties]);
  const emoji = (properties.emoji as string) ?? null;
  const tagIds: string[] = Array.isArray(properties.tags) ? properties.tags : [];
  const resolvedTags = useMemo(
    () => tagIds
      .map((id) => allTags.find((t) => t.id === id))
      .filter(Boolean) as (TagRecord & { id: string; name: string; color: string })[],
    [tagIds, allTags]
  );

  const blockTree = useMemo(() => {
    if (!blocks.length) return [];
    const tree = buildNoteBlockTree(blocks);
    return buildReadOnlyTree(tree);
  }, [blocks]);

  // Position calculation
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const rect = target.anchorRect;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = Math.min(400, viewportWidth - 32);
    const popoverMaxHeight = 380;

    let left = rect.left;
    let top = rect.bottom + 8;

    // Fit horizontally
    if (left + popoverWidth > viewportWidth - 16) {
      left = viewportWidth - popoverWidth - 16;
    }
    if (left < 16) left = 16;

    // Flip vertically if needed
    if (top + popoverMaxHeight > viewportHeight - 16) {
      top = rect.top - popoverMaxHeight - 8;
      if (top < 16) top = 16;
    }

    setPosition({ top, left });
  }, [target.anchorRect]);

  // Close on click outside
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleNavigate = useCallback(() => {
    onNavigate(target.pageTitle);
    onClose();
  }, [onNavigate, onClose, target.pageTitle]);

  if (!position) return null;

  const isLoading = isLoadingPage || isLoadingBlocks;

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-[min(400px,calc(100vw-2rem))] rounded-xl border border-border/60 bg-popover shadow-lg ring-1 ring-foreground/5 animate-in fade-in-0 zoom-in-95 duration-150"
      style={{ top: position.top, left: position.left }}
      onPointerLeave={(e) => {
        // On desktop only, close when pointer leaves the popover
        if (window.matchMedia('(hover: none)').matches) return;
        const related = e.relatedTarget as HTMLElement | null;
        if (!related?.closest?.(".note-ref-token-page")) {
          onClose();
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        {emoji && <SpriteIcon name={emoji} size={18} className="shrink-0" />}
        <span className="text-sm font-semibold truncate flex-1">
          {page?.title ?? target.pageTitle}
        </span>
        <button
          onClick={handleNavigate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Open page"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tags */}
      {resolvedTags.length > 0 && (
        <div className="px-3 py-1.5 border-b border-border/30">
          <TagPillStrip tags={resolvedTags} className="max-w-full" />
        </div>
      )}

      {/* Content */}
      <div className="max-h-[320px] overflow-y-auto px-3 py-2 text-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        ) : !page ? (
          <p className="text-center text-muted-foreground py-4">Page not found</p>
        ) : blockTree.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">Empty page</p>
        ) : (
          <ReadOnlyBlockRenderer blocks={blockTree} />
        )}
      </div>
    </div>
  );
}

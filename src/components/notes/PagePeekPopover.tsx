"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ExternalLink, X } from "lucide-react";
import { useQuery } from "@powersync/react";

import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { TagPillStrip } from "@/components/tags/TagPillStrip";
import { popoverPresence } from "@/lib/shared/motion";
import { useNoteBlocks } from "@/hooks/use-notes";
import type { Tag as TagRecord } from "@/lib/powersync/AppSchema";
import { ReadOnlyBlockRenderer } from "./ReadOnlyBlockRenderer";
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
  const resolvedTags = useMemo(() => {
    const tagIds: string[] = Array.isArray(properties.tags) ? properties.tags : [];
    return tagIds
      .map((id) => allTags.find((t) => t.id === id))
      .filter(Boolean) as (TagRecord & { id: string; name: string; color: string })[];
  }, [properties.tags, allTags]);


  // Position is derived from the anchor rect + viewport — compute it during
  // render (not via an effect that sets state) so it's ready on first paint.
  const position = useMemo(() => {
    const rect = target.anchorRect;
    if (typeof window === "undefined" || !rect) return null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = Math.min(400, viewportWidth - 32);
    const margin = 16;

    let left = rect.left;

    // Determine available space above and below the anchor
    const spaceBelow = viewportHeight - rect.bottom - margin - 8;
    const spaceAbove = rect.top - margin - 8;

    // Pick direction with more room; cap between 280 and 70% of viewport
    const maxAvailable = Math.max(spaceBelow, spaceAbove);
    const maxHeight = Math.max(280, Math.min(maxAvailable, viewportHeight * 0.7));

    let top: number;
    if (spaceBelow >= maxHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 8;
    } else {
      top = rect.top - maxHeight - 8;
      if (top < margin) top = margin;
    }

    // Fit horizontally
    if (left + popoverWidth > viewportWidth - margin) {
      left = viewportWidth - popoverWidth - margin;
    }
    if (left < margin) left = margin;

    return { top, left, maxHeight };
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

  const reduce = useReducedMotion();

  const handleNavigate = useCallback(() => {
    onNavigate(target.pageTitle);
    onClose();
  }, [onNavigate, onClose, target.pageTitle]);

  const isLoading = isLoadingPage || isLoadingBlocks;

  return (
    <AnimatePresence>
    {position && (
    <motion.div
      ref={popoverRef}
      variants={reduce ? undefined : popoverPresence}
      initial={reduce ? false : "initial"}
      animate={reduce ? {} : "animate"}
      exit={reduce ? {} : "exit"}
      className="fixed z-50 w-[min(400px,calc(100vw-2rem))] flex flex-col rounded-xl border border-border/60 bg-popover shadow-lg ring-1 ring-foreground/5"
      style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
      onPointerLeave={(e) => {
        // On desktop (mouse) only, close when pointer leaves the popover
        if (e.pointerType === "touch") return;
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
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 text-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          </div>
        ) : !page ? (
          <p className="text-center text-muted-foreground py-4">Page not found</p>
        ) : blocks.length === 0 ? (
          <p className="text-center text-muted-foreground py-4">Empty page</p>
        ) : (
          <ReadOnlyBlockRenderer blocks={blocks} />
        )}
      </div>
    </motion.div>
    )}
    </AnimatePresence>
  );
}

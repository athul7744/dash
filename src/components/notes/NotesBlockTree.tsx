"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";

import { BlockContextMenu } from "@/components/notes/BlockContextMenu";
import { NoteBlockEditor } from "@/components/notes/NoteBlockEditor";
import { QueryBlockView } from "@/components/notes/QueryBlockView";
import { getBlockContextMenuOptions, type BlockContextMenuActionId, type BlockContextMenuTextStyle } from "@/components/notes/block-context-menu-options";
import type { BlockColorKey } from "@/components/notes/NoteBlockEditorColor";
import type { NoteBlockRow } from "@/hooks/use-notes";
import {
  buildBlockClipboardBlocks,
  getSelectedBlockIds,
  NOTES_BLOCK_CLIPBOARD_MIME,
  serializeBlockClipboardData,
  serializeBlockClipboardMarkdown,
} from "@/lib/notes/block-line-selection";
import {
  blockEndsWithDividerLine,
  defaultBlockSpacingMeta,
  getBlockColor,
  getBlockSpacingMeta,
  getHeadingDividerColor,
  getHeadingDividerOpacity,
  getHeadingOffsetPx,
  getHeadingTreeLineColor,
  type BlockSpacingMeta,
} from "@/lib/notes/block-styling";
import { extractNoteText, normalizeNoteDocument } from "@/lib/notes/notes-content";
import type { BlockRangeMoveDirection } from "@/lib/notes/block-editor-structure";
import { buildNoteBlockTree, createVisibleNoteBlockNeighbors, type NoteTreeNode } from "@/lib/notes/notes-tree";
import type { JsonValue, NoteBlockInsert } from "@/lib/notes/notes";

type BlockTreeNode = NoteTreeNode<NoteBlockRow>;

export function extractBlockText(raw: string | null | undefined) {
  return extractNoteText(raw);
}

const HEADING_LEVELS = [1, 2, 3, 4, 5] as const;

function getBlockContextTextStyle(raw: unknown): BlockContextMenuTextStyle | null {
  const document = normalizeNoteDocument(raw);
  const firstNode = Array.isArray(document.content) ? document.content[0] : null;

  if (!firstNode || typeof firstNode !== "object") {
    return null;
  }

  if (firstNode.type === "paragraph") {
    return "paragraph";
  }

  if (firstNode.type !== "heading") {
    return null;
  }

  const level = typeof firstNode.attrs === "object" && firstNode.attrs && "level" in firstNode.attrs
    ? firstNode.attrs.level
    : null;

  return HEADING_LEVELS.includes(level as (typeof HEADING_LEVELS)[number])
    ? `heading-${level}` as BlockContextMenuTextStyle
    : null;
}

function convertBlockTextStyle(raw: unknown, targetStyle: BlockContextMenuTextStyle): JsonValue | null {
  const document = normalizeNoteDocument(raw);
  const content = Array.isArray(document.content) ? document.content : [];
  const firstNode = content[0];

  if (!firstNode || typeof firstNode !== "object" || (firstNode.type !== "paragraph" && firstNode.type !== "heading")) {
    return null;
  }

  if (targetStyle === "paragraph") {
    const { level: _level, ...attrsWithoutLevel } = ((firstNode.attrs ?? {}) as Record<string, unknown>);
    const nextNode: Record<string, unknown> = {
      ...firstNode,
      type: "paragraph",
    };
    if (Object.keys(attrsWithoutLevel).length > 0) {
      nextNode.attrs = attrsWithoutLevel;
    } else {
      delete nextNode.attrs;
    }

    return { ...document, content: [nextNode, ...content.slice(1)] } as JsonValue;
  }

  const level = Number(targetStyle.replace("heading-", "")) as (typeof HEADING_LEVELS)[number];
  if (!HEADING_LEVELS.includes(level)) {
    return null;
  }

  const attrs = { ...((firstNode.attrs ?? {}) as Record<string, unknown>), level };
  const nextNode = { ...firstNode, type: "heading", attrs };
  return { ...document, content: [nextNode, ...content.slice(1)] } as JsonValue;
}

function BlockNodeView({
  node,
  depth = 0,
  previousSiblingId,
  parentBlockId,
  parentParentBlockId,
  focusedBlockId,
  focusPlacement,
  previousBlockIdById,
  nextBlockIdById,
  blockSpacingMetaById,
  onFocusApplied,
  onFocusBlock,
  onEditorFocus,
  notePageTitles,
  onOpenPageReference,
  onPeekPageReference,
  onCreateSibling,
  onCreateSiblings,
  onMergeWithPrevious,
  onCommitContent,
  onIndent,
  onOutdent,
  onMoveSelectedBlockRange,
  onDelete,
  onDeleteRange,
  onUpdateContent,
  onToggleMarkdownMode,
  markdownToggleVersions,
  selectedBlockIds,
  onSelectUp,
  onSelectDown,
  onClearSelection,
  onBlockEditorCreate,
  onEditorRef,
  onConvertBlockType,
}: {
  node: BlockTreeNode;
  depth?: number;
  previousSiblingId?: string | null;
  parentBlockId?: string | null;
  parentParentBlockId?: string | null;
  focusedBlockId?: string | null;
  focusPlacement?: number | "start" | "end";
  previousBlockIdById: ReadonlyMap<string, string | null>;
  nextBlockIdById: ReadonlyMap<string, string | null>;
  blockSpacingMetaById: ReadonlyMap<string, BlockSpacingMeta>;
  onFocusApplied?: () => void;
  onFocusBlock: (blockId: string, placement: "start" | "end") => void;
  onEditorFocus: (blockId: string, placement: "start" | "end") => void;
  notePageTitles: string[];
  onOpenPageReference?: (title: string) => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onCreateSibling: (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: {
      focusPlacement?: "start" | "end";
      focusTarget?: "created" | "current";
      insertionSide?: "before" | "after";
    }
  ) => void;
  onCreateSiblings?: (blockId: string, parentBlockId: string | null | undefined, nextContent: NoteBlockInsert, nextSiblingContents: NoteBlockInsert[]) => Promise<void> | void;
  onMergeWithPrevious: (blockId: string, previousBlockId: string, nextContent: JsonValue, options?: { hasChildren?: boolean }) => void | Promise<void>;
  onCommitContent: (blockId: string, nextContent: JsonValue) => void;
  onIndent: (blockId: string, nextParentBlockId: string) => void;
  onOutdent: (blockId: string, nextParentBlockId?: string | null) => void;
  onMoveSelectedBlockRange: (blockIds: string[], direction: BlockRangeMoveDirection, focusBlockId: string) => void;
  onDelete: (blockId: string) => void;
  onDeleteRange: (blockIds: string[]) => void | Promise<void>;
  onUpdateContent: (blockId: string, nextContent: JsonValue) => void;
  onToggleMarkdownMode: (blockId: string) => void;
  markdownToggleVersions: Record<string, number>;
  selectedBlockIds: ReadonlySet<string>;
  onSelectUp: (blockId: string, previousBlockId: string) => void;
  onSelectDown: (blockId: string, nextBlockId: string) => void;
  onClearSelection: () => void;
  onBlockEditorCreate?: () => void;
  onEditorRef?: (blockId: string, editor: Editor | null) => void;
  onConvertBlockType?: (blockId: string, blockType: string, content: unknown) => void;
}) {
  const previousBlockId = previousBlockIdById.get(node.block.id) ?? null;
  const nextBlockId = nextBlockIdById.get(node.block.id) ?? null;
  const blockSpacingMeta = blockSpacingMetaById.get(node.block.id) ?? defaultBlockSpacingMeta;
  const previousBlockSpacingMeta = previousBlockId ? (blockSpacingMetaById.get(previousBlockId) ?? defaultBlockSpacingMeta) : defaultBlockSpacingMeta;
  const nextBlockSpacingMeta = nextBlockId ? (blockSpacingMetaById.get(nextBlockId) ?? defaultBlockSpacingMeta) : defaultBlockSpacingMeta;
  const blockType = node.block.type ?? "text";
  const blockContextTextStyle = blockType === "text" ? getBlockContextTextStyle(node.block.content) : null;
  const moveTargetBlockIds = selectedBlockIds.has(node.block.id)
    ? [...selectedBlockIds]
    : [node.block.id];
  const blockContextMenuOptions = getBlockContextMenuOptions({
    blockType,
    textStyle: blockContextTextStyle,
    canMoveUp: previousBlockId !== null,
    canMoveDown: nextBlockId !== null,
    canIndent: !!previousSiblingId,
    canOutdent: !!parentBlockId,
  });
  const bulletRef = useRef<HTMLDivElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const suppressPrimaryActionRef = useRef(false);
  const [isBlockMenuOpen, setIsBlockMenuOpen] = useState(false);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);

  const isFocused = focusedBlockId === node.block.id;

  useEffect(() => {
    if (isFocused || isNearViewport) {
      setIsNearViewport(true);
      return;
    }

    const el = articleRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFocused, isNearViewport]);

  const clearLongPressTimeout = () => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const openBlockMenu = () => {
    clearLongPressTimeout();
    suppressPrimaryActionRef.current = true;
    setIsBlockMenuOpen(true);
  };

  const handleBlockMenuAction = (actionId: BlockContextMenuActionId) => {
    setIsBlockMenuOpen(false);

    switch (actionId) {
      case "move-up":
        if (previousBlockId === null) {
          return;
        }

        onMoveSelectedBlockRange(moveTargetBlockIds, "up", node.block.id);
        return;
      case "move-down":
        if (nextBlockId === null) {
          return;
        }

        onMoveSelectedBlockRange(moveTargetBlockIds, "down", node.block.id);
        return;
      case "indent":
        if (previousSiblingId) {
          onIndent(node.block.id, previousSiblingId);
        }
        return;
      case "outdent":
        if (parentBlockId) {
          onOutdent(node.block.id, parentParentBlockId);
        }
        return;
      case "convert-paragraph":
      case "convert-heading-1":
      case "convert-heading-2":
      case "convert-heading-3":
      case "convert-heading-4":
      case "convert-heading-5": {
        const targetStyle = actionId === "convert-paragraph"
          ? "paragraph"
          : actionId.replace("convert-", "") as BlockContextMenuTextStyle;
        const nextContent = convertBlockTextStyle(node.block.content, targetStyle);
        if (!nextContent) {
          return;
        }

        if (onConvertBlockType) {
          onConvertBlockType(node.block.id, "text", nextContent);
        } else {
          onUpdateContent(node.block.id, nextContent);
          onCommitContent(node.block.id, nextContent);
        }
        return;
      }
      case "color":
        // Handled by onColorSelect in BlockContextMenu
        return;
      case "delete":
        onDelete(node.block.id);
        return;
      default:
        return;
    }
  };

  const handleColorSelect = (color: BlockColorKey | null) => {
    setIsBlockMenuOpen(false);
    const document = normalizeNoteDocument(node.block.content);
    const content = document.content as Array<Record<string, unknown>> | undefined;
    const firstNode = content?.[0];
    if (firstNode) {
      const attrs = (firstNode.attrs ?? {}) as Record<string, unknown>;
      const updatedNode = { ...firstNode, attrs: { ...attrs, color } };
      const updatedDocument = { ...document, content: [updatedNode, ...(content.slice(1))] };
      onUpdateContent(node.block.id, updatedDocument as JsonValue);
      onCommitContent(node.block.id, updatedDocument as JsonValue);
    }
  };

  useEffect(() => {
    if (!isBlockMenuOpen) {
      suppressPrimaryActionRef.current = false;
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (bulletRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsBlockMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBlockMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBlockMenuOpen]);

  useEffect(() => clearLongPressTimeout, []);

  const rowMarginTop = blockEndsWithDividerLine(previousBlockSpacingMeta) && blockSpacingMeta.kind === "heading" && blockSpacingMeta.headingLevel
    ? getHeadingOffsetPx(blockSpacingMeta.headingLevel)
    : 0;
  const editorSurfaceStyle = blockSpacingMeta.kind === "hr" && nextBlockSpacingMeta.kind === "heading" && nextBlockSpacingMeta.headingLevel
    ? ({ "--note-hr-accent": getHeadingDividerColor(nextBlockSpacingMeta.headingLevel), "--note-hr-opacity": getHeadingDividerOpacity(nextBlockSpacingMeta.headingLevel) } as CSSProperties)
    : undefined;

  const childrenBorderStyle: CSSProperties | undefined = node.children.length > 0
    ? blockSpacingMeta.kind === "heading" && blockSpacingMeta.headingLevel
      ? { marginLeft: 14, borderColor: getHeadingTreeLineColor(blockSpacingMeta.headingLevel) } as CSSProperties
      : { marginLeft: 14, borderColor: "color-mix(in oklab, currentColor 15%, transparent)" } as CSSProperties
    : undefined;

  const blockColor = getBlockColor(node.block.content);
  const blockColorClass = blockColor ? `block-color-${blockColor}` : "";

  return (
    <div className={`space-y-0 ${blockColorClass}`}>
      <article
        ref={articleRef}
        className={`group relative ${blockSpacingMeta.kind === "heading" ? `sm:sticky sm:top-0 z-20 isolate bg-background shadow-[0_1px_0_0_hsl(var(--border)/0.5)]` : ""}`}
        onMouseDownCapture={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest('[data-block-context-menu="true"]')) {
            return;
          }

          if (!event.shiftKey && selectedBlockIds.size > 0) {
            onClearSelection();
          }
        }}
        style={{ marginTop: rowMarginTop }}
      >
        <div className="flex items-center gap-px px-0 py-0">
          <div ref={bulletRef} className={`relative flex min-h-6 w-3.5 shrink-0 items-center justify-start ${blockSpacingMeta.kind === "heading" ? `self-start ${blockSpacingMeta.headingLevel === 1 ? "pt-1.5" : blockSpacingMeta.headingLevel === 2 ? "pt-0.5" : blockSpacingMeta.headingLevel === 5 ? "-mt-px" : ""}` : "self-stretch"}`}>
            <button
              type="button"
              onPointerDown={(event) => {
                if (event.pointerType === "mouse" || event.button !== 0) {
                  return;
                }

                clearLongPressTimeout();
                longPressTimeoutRef.current = window.setTimeout(() => {
                  openBlockMenu();
                }, 450);
              }}
              onPointerUp={clearLongPressTimeout}
              onPointerCancel={clearLongPressTimeout}
              onPointerLeave={clearLongPressTimeout}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openBlockMenu();
              }}
              onMouseDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
              }}
              onClick={(event) => {
                event.preventDefault();

                if (suppressPrimaryActionRef.current) {
                  suppressPrimaryActionRef.current = false;
                  return;
                }

                setIsBlockMenuOpen(false);
                onToggleMarkdownMode(node.block.id);
              }}
              className={`relative z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm outline-none transition-opacity ${depth > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
              aria-label="Toggle raw markdown view"
              title="Toggle raw markdown view"
              aria-haspopup="menu"
              aria-expanded={isBlockMenuOpen}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 transition-colors group-focus-within:bg-foreground" />
            </button>
            {isBlockMenuOpen ? <BlockContextMenu options={blockContextMenuOptions} onAction={handleBlockMenuAction} onColorSelect={handleColorSelect} /> : null}
          </div>
          <div className={`min-w-0 flex-1 rounded-sm transition-smooth ${selectedBlockIds.has(node.block.id) ? "bg-accent/45" : ""}`} style={editorSurfaceStyle}>
            {blockType === "query" ? (
              <QueryBlockView
                content={node.block.content}
                onUpdateContent={(nextContent) => {
                  onUpdateContent(node.block.id, nextContent as JsonValue);
                }}
                onOpenPageReference={onOpenPageReference}
              />
            ) : isNearViewport ? (
              <NoteBlockEditor
                content={node.block.content}
                notePageTitles={notePageTitles}
                hasChildren={node.children.length > 0}
                markdownToggleVersion={markdownToggleVersions[node.block.id] ?? 0}
                shouldFocus={isFocused}
                focusPlacement={focusPlacement}
                onFocusApplied={onFocusApplied}
                onEditorCreate={(editor) => {
                  onBlockEditorCreate?.();
                  onEditorRef?.(node.block.id, editor);
                }}
                onFocus={() => {
                  onEditorFocus(node.block.id, "start");
                }}
                onChange={(nextContent) => {
                  onUpdateContent(node.block.id, nextContent as JsonValue);
                }}
                onCommit={(nextContent) => {
                  onCommitContent(node.block.id, nextContent as JsonValue);
                }}
                onCreateSibling={(nextContent, nextSiblingContent, options) => onCreateSibling(node.block.id, parentBlockId, nextContent as JsonValue, nextSiblingContent as JsonValue | undefined, options)}
                onCreateSiblings={onCreateSiblings ? (nextContent, nextSiblingContents) => onCreateSiblings(node.block.id, parentBlockId, nextContent, nextSiblingContents) : undefined}
                onMergeWithPrevious={previousBlockId ? (nextContent, options) => onMergeWithPrevious(node.block.id, previousBlockId, nextContent as JsonValue, options) : undefined}
                onOpenPageReference={onOpenPageReference}
                onPeekPageReference={onPeekPageReference}
                onNavigateUp={previousBlockId ? () => onFocusBlock(previousBlockId, "end") : undefined}
                onNavigateDown={nextBlockId ? () => onFocusBlock(nextBlockId, "start") : undefined}
                onSelectUp={previousBlockId ? () => onSelectUp(node.block.id, previousBlockId) : undefined}
                onSelectDown={nextBlockId ? () => onSelectDown(node.block.id, nextBlockId) : undefined}
                onIndent={() => {
                  if (!previousSiblingId) return;
                  onIndent(node.block.id, previousSiblingId);
                }}
                onOutdent={() => {
                  if (!parentBlockId) return;
                  onOutdent(node.block.id, parentParentBlockId);
                }}
                onMoveSelectionUp={moveTargetBlockIds ? () => onMoveSelectedBlockRange(moveTargetBlockIds, "up", node.block.id) : undefined}
                onMoveSelectionDown={moveTargetBlockIds ? () => onMoveSelectedBlockRange(moveTargetBlockIds, "down", node.block.id) : undefined}
                onDeleteEmpty={() => onDelete(node.block.id)}
                onConvertBlockType={onConvertBlockType ? (blockType, content) => onConvertBlockType(node.block.id, blockType, content) : undefined}
              />
            ) : (
              <div className="min-h-[1.5em] px-1 py-0.5 text-sm text-foreground/80 whitespace-pre-wrap">{extractBlockText(node.block.content) || "\u00A0"}</div>
            )}
          </div>
        </div>
      </article>

      {node.children.length > 0 ? (
        <div className="space-y-0 border-l border-border/55 pl-2" style={childrenBorderStyle}>
          {node.children.map((child, index) => (
            <BlockNodeView
              key={child.block.id}
              node={child}
              depth={depth + 1}
              previousSiblingId={index > 0 ? node.children[index - 1].block.id : null}
              parentBlockId={node.block.id}
              parentParentBlockId={node.block.parent_block_id}
              focusedBlockId={focusedBlockId}
              focusPlacement={focusPlacement}
              previousBlockIdById={previousBlockIdById}
              nextBlockIdById={nextBlockIdById}
              blockSpacingMetaById={blockSpacingMetaById}
              onFocusApplied={onFocusApplied}
              onFocusBlock={onFocusBlock}
              onEditorFocus={onEditorFocus}
              notePageTitles={notePageTitles}
              onOpenPageReference={onOpenPageReference}
              onPeekPageReference={onPeekPageReference}
              onCreateSibling={onCreateSibling}
              onCreateSiblings={onCreateSiblings}
              onCommitContent={onCommitContent}
              onMergeWithPrevious={onMergeWithPrevious}
              onIndent={onIndent}
              onOutdent={onOutdent}
              onMoveSelectedBlockRange={onMoveSelectedBlockRange}
              onDelete={onDelete}
              onDeleteRange={onDeleteRange}
              onUpdateContent={onUpdateContent}
              onToggleMarkdownMode={onToggleMarkdownMode}
              markdownToggleVersions={markdownToggleVersions}
              selectedBlockIds={selectedBlockIds}
              onSelectUp={onSelectUp}
              onSelectDown={onSelectDown}
              onClearSelection={onClearSelection}
              onBlockEditorCreate={onBlockEditorCreate}
              onEditorRef={onEditorRef}
              onConvertBlockType={onConvertBlockType}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NotesBlockTree({
  blocks,
  onCreateFirstBlock,
  focusedBlockId,
  focusPlacement,
  onFocusApplied,
  onFocusBlock,
  notePageTitles,
  onOpenPageReference,
  onPeekPageReference,
  onCreateSibling,
  onCreateEmptySibling,
  onCreateSiblings,
  onMergeWithPrevious,
  onCommitContent,
  onIndent,
  onOutdent,
  onMoveSelectedBlockRange,
  onDelete,
  onDeleteRange,
  onUpdateContent,
  onFirstBlockReady,
  onEditorRef,
  onConvertBlockType,
}: {
  blocks: NoteBlockRow[];
  onCreateFirstBlock: () => void;
  focusedBlockId?: string | null;
  focusPlacement?: number | "start" | "end";
  onFocusApplied?: () => void;
  onFocusBlock: (blockId: string, placement: "start" | "end") => void;
  notePageTitles: string[];
  onOpenPageReference?: (title: string) => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onCreateSibling: (
    blockId: string,
    parentBlockId: string | null | undefined,
    nextContent: JsonValue,
    nextSiblingContent?: JsonValue,
    options?: {
      focusPlacement?: "start" | "end";
      focusTarget?: "created" | "current";
      insertionSide?: "before" | "after";
    }
  ) => void;
  onCreateEmptySibling: (blockId: string, parentBlockId: string | null | undefined) => void;
  onCreateSiblings?: (blockId: string, parentBlockId: string | null | undefined, nextContent: NoteBlockInsert, nextSiblingContents: NoteBlockInsert[]) => Promise<void> | void;
  onMergeWithPrevious: (blockId: string, previousBlockId: string, nextContent: JsonValue, options?: { hasChildren?: boolean }) => void | Promise<void>;
  onCommitContent: (blockId: string, nextContent: JsonValue) => void;
  onIndent: (blockId: string, nextParentBlockId: string) => void;
  onOutdent: (blockId: string, nextParentBlockId?: string | null) => void;
  onMoveSelectedBlockRange: (blockIds: string[], direction: BlockRangeMoveDirection, focusBlockId: string) => void;
  onDelete: (blockId: string) => void;
  onDeleteRange: (blockIds: string[]) => void | Promise<void>;
  onUpdateContent: (blockId: string, nextContent: JsonValue) => void;
  onFirstBlockReady?: () => void;
  onEditorRef?: (blockId: string, editor: Editor | null) => void;
  onConvertBlockType?: (blockId: string, blockType: string, content: unknown) => void;
}) {
  const [markdownToggleVersions, setMarkdownToggleVersions] = useState<Record<string, number>>({});
  const [blockRangeSelection, setBlockRangeSelection] = useState<{ anchorBlockId: string; focusBlockId: string } | null>(null);
  const tree = buildNoteBlockTree(blocks);
  const { orderedBlockIds, previousBlockIdById, nextBlockIdById } = createVisibleNoteBlockNeighbors(blocks);
  const blockSpacingMetaById = useMemo(
    () => new Map(blocks.map((block) => [block.id, getBlockSpacingMeta(block.content)])),
    [blocks]
  );
  const lastRootBlock = tree[tree.length - 1]?.block ?? null;
  const selectedBlockIds = useMemo(() => {
    if (!blockRangeSelection) {
      return [];
    }

    return getSelectedBlockIds(orderedBlockIds, blockRangeSelection.anchorBlockId, blockRangeSelection.focusBlockId);
  }, [blockRangeSelection, orderedBlockIds]);
  const selectedBlockIdSet = useMemo(() => new Set(selectedBlockIds), [selectedBlockIds]);

  const firstBlockReadyFiredRef = useRef(false);
  const previousBlockPageIdRef = useRef(blocks[0]?.page_id);

  // Reset when blocks belong to a different page
  if (blocks[0]?.page_id !== previousBlockPageIdRef.current) {
    previousBlockPageIdRef.current = blocks[0]?.page_id;
    firstBlockReadyFiredRef.current = false;
  }

  const handleBlockEditorCreate = () => {
    if (firstBlockReadyFiredRef.current) return;
    firstBlockReadyFiredRef.current = true;
    onFirstBlockReady?.();
  };

  const handleToggleMarkdownMode = (blockId: string) => {
    setMarkdownToggleVersions((current) => ({
      ...current,
      [blockId]: (current[blockId] ?? 0) + 1,
    }));
    setBlockRangeSelection(null);
    onFocusBlock(blockId, "end");
  };

  const handleCopySelectedBlocks = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (selectedBlockIds.length === 0 || !event.clipboardData) {
      return;
    }

    const clipboardBlocks = buildBlockClipboardBlocks(blocks, selectedBlockIds);
    if (clipboardBlocks.length === 0) {
      return;
    }

    const markdown = serializeBlockClipboardMarkdown(clipboardBlocks);
    event.preventDefault();
    event.clipboardData.setData(NOTES_BLOCK_CLIPBOARD_MIME, serializeBlockClipboardData(clipboardBlocks));
    event.clipboardData.setData("text/plain", markdown);
    event.clipboardData.setData("text/markdown", markdown);
  };

  const handleCutSelectedBlocks = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (selectedBlockIds.length === 0 || !event.clipboardData) {
      return;
    }

    const clipboardBlocks = buildBlockClipboardBlocks(blocks, selectedBlockIds);
    if (clipboardBlocks.length === 0) {
      return;
    }

    const markdown = serializeBlockClipboardMarkdown(clipboardBlocks);
    event.preventDefault();
    event.clipboardData.setData(NOTES_BLOCK_CLIPBOARD_MIME, serializeBlockClipboardData(clipboardBlocks));
    event.clipboardData.setData("text/plain", markdown);
    event.clipboardData.setData("text/markdown", markdown);
    void onDeleteRange(selectedBlockIds);
    setBlockRangeSelection(null);
  };

  const handleSelectUp = (blockId: string, previousBlockId: string) => {
    setBlockRangeSelection((currentSelection) => (
      currentSelection && currentSelection.focusBlockId === blockId
        ? { ...currentSelection, focusBlockId: previousBlockId }
        : { anchorBlockId: blockId, focusBlockId: previousBlockId }
    ));
    onFocusBlock(previousBlockId, "end");
  };

  const handleSelectDown = (blockId: string, nextBlockId: string) => {
    setBlockRangeSelection((currentSelection) => (
      currentSelection && currentSelection.focusBlockId === blockId
        ? { ...currentSelection, focusBlockId: nextBlockId }
        : { anchorBlockId: blockId, focusBlockId: nextBlockId }
    ));
    onFocusBlock(nextBlockId, "start");
  };

  const handleFocusBlock = (blockId: string, placement: "start" | "end") => {
    setBlockRangeSelection(null);
    onFocusBlock(blockId, placement);
  };

  const handleEditorFocus = (blockId: string, placement: "start" | "end") => {
    onFocusBlock(blockId, placement);
  };

  if (tree.length === 0) {
    return (
      <div
        role="button"
        tabIndex={0}
        onMouseDown={(event) => {
          event.preventDefault();
          onCreateFirstBlock();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onCreateFirstBlock();
        }}
        className="cursor-text outline-none"
      >
        <div className="flex min-h-6 items-center gap-px px-0 py-0 text-sm text-muted-foreground">
          <div className="w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">Empty page</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0 transition-smooth" onCopy={handleCopySelectedBlocks} onCut={handleCutSelectedBlocks}>
      {tree.map((node, index) => (
        <BlockNodeView
          key={node.block.id}
          node={node}
          previousSiblingId={index > 0 ? tree[index - 1].block.id : null}
          parentBlockId={null}
          parentParentBlockId={null}
          focusedBlockId={focusedBlockId}
          focusPlacement={focusPlacement}
          previousBlockIdById={previousBlockIdById}
          nextBlockIdById={nextBlockIdById}
          blockSpacingMetaById={blockSpacingMetaById}
          onFocusApplied={onFocusApplied}
          onFocusBlock={handleFocusBlock}
          onEditorFocus={handleEditorFocus}
          notePageTitles={notePageTitles}
          onOpenPageReference={onOpenPageReference}
          onPeekPageReference={onPeekPageReference}
          onCreateSibling={onCreateSibling}
            onCreateSiblings={onCreateSiblings}
          onMergeWithPrevious={onMergeWithPrevious}
          onCommitContent={onCommitContent}
          onIndent={onIndent}
          onOutdent={onOutdent}
          onMoveSelectedBlockRange={onMoveSelectedBlockRange}
          onDelete={onDelete}
          onDeleteRange={onDeleteRange}
          onUpdateContent={onUpdateContent}
          onToggleMarkdownMode={handleToggleMarkdownMode}
          markdownToggleVersions={markdownToggleVersions}
          selectedBlockIds={selectedBlockIdSet}
          onSelectUp={handleSelectUp}
          onSelectDown={handleSelectDown}
          onClearSelection={() => setBlockRangeSelection(null)}
          onBlockEditorCreate={handleBlockEditorCreate}
          onEditorRef={onEditorRef}
          onConvertBlockType={onConvertBlockType}
        />
      ))}

      {lastRootBlock ? (
        <div className="group mt-2 px-0 py-1">
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={() => onCreateEmptySibling(lastRootBlock.id, null)}
            className="flex min-h-6 w-full items-center gap-px rounded-sm px-0 py-0 text-xs text-muted-foreground/80 opacity-0 outline-none transition-all group-hover:opacity-100 group-focus-within:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:text-foreground"
            aria-label="Add block below"
          >
            <div className="flex w-3.5 shrink-0 items-center justify-start" aria-hidden="true">
              <Plus className="h-2.5 w-2.5" />
            </div>
            <div className="min-w-0 flex-1 text-left leading-5">Add block</div>
          </button>
        </div>
      ) : null}
    </div>
  );
}
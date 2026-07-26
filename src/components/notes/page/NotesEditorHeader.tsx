"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Copy, Ellipsis, Files, Keyboard, Link2, Star, Timer, Trash2 } from "lucide-react";

import { TagPillStrip } from "@/components/tags/TagPillStrip";
import { TagSelector } from "@/components/tags/TagSelector";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "@/lib/powersync/AppSchema";
import { IconPicker } from "@/components/notes/IconPicker";
import { SpriteIcon } from "@/components/notes/SpriteIcon";
import { MarkdownCheatsheetDialog } from "@/components/notes/MarkdownCheatsheetDialog";
import { EventComposeDialog } from "@/components/events/EventLogNow";

import { type NoteTag } from "./types";

type EditorHeaderContent = {
  title: string;
  emoji: string | null;
  favorite: boolean;
  tags: NoteTag[];
  blockCount: number;
  backlinkCount: number;
};

export function NotesEditorHeader({
  editorContent,
  showEditorOverlay: _showEditorOverlay,
  shouldAnimateEditorContent,
  pageTitleDraft,
  pageTitleError,
  isEmojiPickerOpen,
  activePageEmoji,
  selectedTagIdsDraft,
  allTags,
  isLoadingTags,
  pageId,
  onBack,
  onTitleChange,
  onCommitTitle,
  onToggleFavorite,
  onEmojiPickerOpenChange,
  onSelectEmoji,
  onSelectedTagIdsChange,
  onCopyDocument,
  onOpenDeleteDialog,
}: {
  editorContent: EditorHeaderContent;
  showEditorOverlay: boolean;
  shouldAnimateEditorContent: boolean;
  pageTitleDraft: string;
  pageTitleError: string | null;
  isEmojiPickerOpen: boolean;
  activePageEmoji: string | null;
  selectedTagIdsDraft: string[];
  allTags: Tag[];
  isLoadingTags: boolean;
  /** The open note's id — subject for a logged event. */
  pageId: string;
  onBack: () => void;
  onTitleChange: (value: string) => void;
  onCommitTitle: () => void | Promise<void>;
  onToggleFavorite: () => void;
  onEmojiPickerOpenChange: (open: boolean) => void;
  onSelectEmoji: (emoji: string | null) => void;
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  onCopyDocument: () => void | Promise<void>;
  onOpenDeleteDialog: () => void;
}) {
  const [isCheatsheetOpen, setIsCheatsheetOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const mobileHeaderChromeButtonClass = "inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,box-shadow] duration-200 hover:bg-accent/60 hover:text-foreground hover:shadow-[0_10px_24px_-18px_rgba(15,23,42,0.5)]";
  const visibleTags = useMemo(() => {
    // When draft is empty but editor content has tags, use those (pre-hydration)
    if (selectedTagIdsDraft.length === 0 && editorContent.tags.length > 0) {
      return editorContent.tags.map((tag) => ({
        id: tag.id,
        name: tag.name?.trim() || "Tag",
        color: tag.color || "slate",
      }));
    }
    return selectedTagIdsDraft
      .map((tagId) => allTags.find((tag) => tag.id === tagId) ?? null)
      .filter((tag): tag is Tag => tag !== null)
      .map((tag) => ({
        id: tag.id,
        name: tag.name?.trim() || "Tag",
        color: tag.color || "slate",
      }));
  }, [allTags, editorContent.tags, selectedTagIdsDraft]);

  return (
    <>
      <div className="contents">
        <Button
          variant="ghost"
          onClick={onBack}
          className="hidden -ml-2 -mr-1 size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground md:size-9"
          aria-label="Back to notes list"
        >
          <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
        </Button>
        <Input
          value={pageTitleDraft}
          onChange={(event) => {
            onTitleChange(event.target.value);
          }}
          onBlur={() => {
            void onCommitTitle();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void onCommitTitle();
              event.currentTarget.blur();
            }
          }}
          readOnly={false}
          className="font-heading col-start-1 h-auto rounded-none border-0 bg-transparent px-0 py-0 pl-3 text-4xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/55 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-5xl sm:col-start-2 sm:pl-0"
          style={{ color: "color-mix(in oklab, #cba6f7 66%, var(--color-foreground))" }}
          placeholder="Untitled"
        />
        <div className="col-start-2 mt-1 flex items-center justify-self-end gap-1.5 sm:col-start-3 sm:hidden">
          <Button
            variant="ghost"
            className={`${mobileHeaderChromeButtonClass} shrink-0 ${editorContent.favorite ? "text-amber-500 hover:text-amber-500" : ""}`}
            onClick={onToggleFavorite}
            aria-label="Toggle favorite"
          >
            <Star className={`h-4 w-4 ${editorContent.favorite ? "fill-current" : ""}`} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className={`${mobileHeaderChromeButtonClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}>
              <Ellipsis className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => {
                  (document.activeElement as HTMLElement)?.blur?.();
                  setIsLogOpen(true);
                }}
              >
                <Timer className="h-4 w-4" />
                Log an event
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void onCopyDocument();
                }}
              >
                <Copy className="h-4 w-4" />
                Copy document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsCheatsheetOpen(true)}>
                <Keyboard className="h-4 w-4" />
                Shortcuts
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onOpenDeleteDialog}>
                <Trash2 className="h-4 w-4" />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <MarkdownCheatsheetDialog open={isCheatsheetOpen} onOpenChange={setIsCheatsheetOpen} />
          <EventComposeDialog subjectId={pageId} subjectKind="note" open={isLogOpen} onOpenChange={setIsLogOpen} />
        </div>
      </div>

      <div className={`col-span-2 flex items-center gap-2 overflow-x-auto overscroll-x-contain overscroll-y-none pl-3 text-xs text-muted-foreground [touch-action:pan-x] sm:col-span-1 sm:col-start-2 sm:pl-0 ${shouldAnimateEditorContent ? "animate-stagger" : ""}`}>
        {pageTitleError ? <span className="text-destructive">{pageTitleError}</span> : null}
        <div className="flex min-w-max items-center gap-2 pr-1">
          <Popover open={isEmojiPickerOpen} onOpenChange={onEmojiPickerOpenChange}>
            <PopoverTrigger className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-foreground">
              {activePageEmoji ? (
                <SpriteIcon name={activePageEmoji} size={14} className="text-foreground" />
              ) : (
                <span className="leading-none">🖤</span>
              )}
            </PopoverTrigger>
            <PopoverContent className="w-auto rounded-2xl p-2">
              <IconPicker
                value={activePageEmoji}
                onSelect={(icon) => { onSelectEmoji(icon); onEmojiPickerOpenChange(false); }}
                onClear={() => { onSelectEmoji(null); onEmojiPickerOpenChange(false); }}
              />
            </PopoverContent>
          </Popover>
          {visibleTags.length === 0 && !isLoadingTags ? (
            <TagSelector
              selectedTagIds={selectedTagIdsDraft}
              onSelectedTagIdsChange={onSelectedTagIdsChange}
              density="compact"
              triggerLabel="Add tag"
              triggerClassName="h-7 rounded-full bg-muted px-2.5 text-xs text-foreground hover:bg-accent hover:text-foreground"
              popoverWidthClassName="w-[240px]"
              showSelectedTags={false}
              maxSelected={5}
            />
          ) : (
            <TagSelector
              selectedTagIds={selectedTagIdsDraft}
              onSelectedTagIdsChange={onSelectedTagIdsChange}
              triggerClassName="rounded-sm"
              popoverWidthClassName="w-[240px]"
              showSelectedTags={false}
              maxSelected={5}
              triggerContent={(
                <TagPillStrip
                  tags={visibleTags}
                  className="max-w-[11rem] sm:max-w-[14rem]"
                  collapsible
                  autoCollapseMs={10000}
                  expandOnClick
                  useParentScroll
                />
              )}
            />
          )}
          {editorContent.blockCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1"><Files className="h-3 w-3" />{editorContent.blockCount} blocks</span>
          )}
          {editorContent.backlinkCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1"><Link2 className="h-3 w-3" />{editorContent.backlinkCount} backlinks</span>
          )}
        </div>
      </div>
    </>
  );
}
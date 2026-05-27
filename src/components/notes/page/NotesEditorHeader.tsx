"use client";

import { useMemo } from "react";
import { ArrowLeft, Copy, Ellipsis, Files, Link2, Star, Trash2 } from "lucide-react";

import { TagPillStrip } from "@/components/tags/TagPillStrip";
import { TagSelector } from "@/components/tags/TagSelector";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tag } from "@/lib/powersync/AppSchema";
import { cn } from "@/lib/shared/utils";

import { NOTE_PAGE_EMOJI_OPTIONS, type NoteTag } from "./types";

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
          className="col-start-1 h-auto rounded-none border-0 bg-transparent px-0 py-0 pl-3 text-4xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/55 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-5xl sm:col-start-2 sm:pl-0"
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
                  void onCopyDocument();
                }}
              >
                <Copy className="h-4 w-4" />
                Copy document
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onOpenDeleteDialog}>
                <Trash2 className="h-4 w-4" />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className={`col-span-2 flex items-center gap-2 overflow-x-auto overscroll-x-contain overscroll-y-none pl-3 text-xs text-muted-foreground [touch-action:pan-x] sm:col-span-1 sm:col-start-2 sm:pl-0 ${shouldAnimateEditorContent ? "animate-stagger" : ""}`}>
        {pageTitleError ? <span className="text-destructive">{pageTitleError}</span> : null}
        <div className="flex min-w-max items-center gap-2 pr-1">
          <Popover open={isEmojiPickerOpen} onOpenChange={onEmojiPickerOpenChange}>
            <PopoverTrigger className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-foreground">
              <span className="leading-none">{activePageEmoji ?? "🖤"}</span>
            </PopoverTrigger>
            <PopoverContent className="w-auto gap-2 rounded-2xl p-2">
              <div className="grid grid-cols-8 gap-1.5">
                {NOTE_PAGE_EMOJI_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg text-lg leading-none transition-colors hover:bg-muted",
                      activePageEmoji === emoji ? "bg-muted text-foreground" : "text-foreground/80"
                    )}
                    onClick={() => {
                      onSelectEmoji(emoji);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="flex h-7 items-center justify-center rounded-lg px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                onClick={() => {
                  onSelectEmoji(null);
                }}
                disabled={!activePageEmoji}
              >
                Clear icon
              </button>
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
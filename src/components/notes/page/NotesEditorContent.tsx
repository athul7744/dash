"use client";

import type { Editor } from "@tiptap/core";
import { useQuery } from "@powersync/react";

import { SingleBlockEditor } from "@/components/notes/editor/SingleBlockEditor";
import { NotesEditorMainSkeleton } from "@/components/notes/NotesPageSkeleton";
import type { NoteAttachmentRow } from "@/hooks/use-notes";
import { Tag } from "@/lib/powersync/AppSchema";

import { AddBannerChip, NotePageBanner } from "./NotePageBanner";
import { NotesEditorHeader } from "./NotesEditorHeader";
import { NotePageProperties } from "./NotePageProperties";
import type { NotesEditorRenderableContent } from "./types";

export function NotesEditorContent({
  editorContent,
  attachments,
  showSelectedPageLoading,
  showEditorOverlay,
  shouldAnimateEditorContent,
  pageTitleDraft,
  pageTitleError,
  isEmojiPickerOpen,
  activePageEmoji,
  selectedTagIdsDraft,
  notePageTitles,
  notePageEmojiByTitle,
  selectedPageProperties,
  onBack,
  onTitleChange,
  onCommitTitle,
  onToggleFavorite,
  onEmojiPickerOpenChange,
  onSelectEmoji,
  onSelectedTagIdsChange,
  onCopyDocument,
  onOpenDeleteDialog,
  onOpenPageReference,
  onPeekPageReference,
  onSingleEditorChange,
}: {
  editorContent: NotesEditorRenderableContent;
  /** Every file on the page — the banner reads its image and its picker from these. */
  attachments: NoteAttachmentRow[];
  showSelectedPageLoading: boolean;
  showEditorOverlay: boolean;
  shouldAnimateEditorContent: boolean;
  pageTitleDraft: string;
  pageTitleError: string | null;
  isEmojiPickerOpen: boolean;
  activePageEmoji: string | null;
  selectedTagIdsDraft: string[];
  notePageTitles: string[];
  notePageEmojiByTitle: Record<string, string | null>;
  selectedPageProperties: Record<string, unknown>;
  onBack: () => void;
  onTitleChange: (value: string) => void;
  onCommitTitle: () => void | Promise<void>;
  onToggleFavorite: () => void;
  onEmojiPickerOpenChange: (open: boolean) => void;
  onSelectEmoji: (emoji: string | null) => void;
  onSelectedTagIdsChange: (tagIds: string[]) => void;
  onCopyDocument: () => void | Promise<void>;
  onOpenDeleteDialog: () => void;
  onOpenPageReference: (title: string) => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
  onSingleEditorChange?: (editor: Editor | null) => void;
}) {
  const { data: allTags = [], isLoading: isLoadingTags } = useQuery<Tag>("SELECT * FROM tags ORDER BY name ASC");

  if (showSelectedPageLoading) {
    return (
      <div className="mx-auto h-full max-w-3xl">
        <NotesEditorMainSkeleton />
      </div>
    );
  }

  if (!editorContent) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-sm text-muted-foreground">
        This page is not available locally.
      </div>
    );
  }

  return (
    <div className="notes-reading relative mx-auto max-w-3xl min-h-[200px]">
      {editorContent.pageId ? (
        <NotePageBanner
          pageId={editorContent.pageId}
          pageProperties={selectedPageProperties}
          attachments={attachments}
        />
      ) : null}

      <div className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-1.5 md:gap-x-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${shouldAnimateEditorContent ? "animate-fade-slide-in" : ""}`}>
        <NotesEditorHeader
          editorContent={editorContent}
          showEditorOverlay={showEditorOverlay}
          shouldAnimateEditorContent={shouldAnimateEditorContent}
          pageTitleDraft={pageTitleDraft}
          pageTitleError={pageTitleError}
          isEmojiPickerOpen={isEmojiPickerOpen}
          activePageEmoji={activePageEmoji}
          selectedTagIdsDraft={selectedTagIdsDraft}
          allTags={allTags}
          isLoadingTags={isLoadingTags}
          pageId={editorContent.pageId ?? ""}
          bannerSlot={
            editorContent.pageId ? (
              <AddBannerChip
                pageId={editorContent.pageId}
                pageProperties={selectedPageProperties}
                attachments={attachments}
              />
            ) : null
          }
          onBack={onBack}
          onTitleChange={onTitleChange}
          onCommitTitle={onCommitTitle}
          onToggleFavorite={onToggleFavorite}
          onEmojiPickerOpenChange={onEmojiPickerOpenChange}
          onSelectEmoji={onSelectEmoji}
          onSelectedTagIdsChange={onSelectedTagIdsChange}
          onCopyDocument={onCopyDocument}
          onOpenDeleteDialog={onOpenDeleteDialog}
        />

        {editorContent.pageId ? (
          <NotePageProperties
            pageId={editorContent.pageId}
            pageProperties={selectedPageProperties}
            shouldAnimate={shouldAnimateEditorContent}
          />
        ) : null}

        {editorContent.pageId ? (
          <SingleBlockEditor
            key={editorContent.pageId}
            pageId={editorContent.pageId}
            handlers={{ notePageTitles, notePageEmojiByTitle, onOpenPageReference, onPeekPageReference }}
            onEditorChange={onSingleEditorChange}
          />
        ) : null}
      </div>
    </div>
  );
}

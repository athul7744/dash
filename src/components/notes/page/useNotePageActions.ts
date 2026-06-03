"use client";

import { startTransition, type Dispatch, type SetStateAction } from "react";

import type { NoteBlockRow, NotePageRow } from "@/hooks/use-notes";
import { extractNoteText } from "@/lib/notes/notes-content";
import {
  deleteNotePage,
  isNotePageTitleAvailable,
  normalizeNotePageTitle,
  updateNotePageProperties,
  updateNotePageTitle,
} from "@/lib/notes/notes";

import type { NormalizedNotePage, NoteTag } from "./types";
import { parseProperties } from "./utils";

type FocusTarget = { blockId: string; placement: "start" | "end" } | null;

type PagePropertiesRecord = Record<string, null | boolean | number | string | unknown[] | Record<string, unknown>>;

type UseNotePageActionsParams = {
  selectedPageId: string | null;
  selectedPage: NotePageRow | null | undefined;
  selectedPageProperties: Record<string, unknown>;
  selectedPageSummary: string | null;
  selectedPageTags: NoteTag[];
  pageTitleDraft: string;
  activePageEmoji: string | null;
  summaryDraft: string;
  selectedTagIdsDraft: string[];
  displayBlocks: NoteBlockRow[];
  orderedVisibleBlockIds: string[];
  selectedBlockMap: Map<string, NoteBlockRow>;
  setPageTitleDraft: Dispatch<SetStateAction<string>>;
  setPageTitleError: Dispatch<SetStateAction<string | null>>;
  setPageEmojiDraft: Dispatch<SetStateAction<string | null | undefined>>;
  setIsEmojiPickerOpen: Dispatch<SetStateAction<boolean>>;
  setIsDeletingPage: Dispatch<SetStateAction<boolean>>;
  setIsDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  onDeleteSuccess: () => void;
};

export function useNotePageActions({
  selectedPageId,
  selectedPage,
  selectedPageProperties,
  selectedPageSummary,
  selectedPageTags,
  pageTitleDraft,
  activePageEmoji,
  summaryDraft,
  selectedTagIdsDraft,
  displayBlocks,
  orderedVisibleBlockIds,
  selectedBlockMap,
  setPageTitleDraft,
  setPageTitleError,
  setPageEmojiDraft,
  setIsEmojiPickerOpen,
  setIsDeletingPage,
  setIsDeleteDialogOpen,
  onDeleteSuccess,
}: UseNotePageActionsParams) {
  const persistSelectedPageProperties = (
    nextSummary: string,
    nextTagIds: string[],
    nextEmoji = activePageEmoji
  ) => {
    if (!selectedPageId) return;

    const nextTags = [...new Set(nextTagIds.map((tagId) => tagId.trim()).filter(Boolean))];

    updateNotePageProperties(selectedPageId, {
      ...(selectedPageProperties as PagePropertiesRecord),
      summary: nextSummary,
      tags: nextTags,
      emoji: nextEmoji,
    });
  };

  const commitPageTitleDraft = async () => {
    if (!selectedPageId) {
      return;
    }

    const normalizedDraft = normalizeNotePageTitle(pageTitleDraft) || "Untitled page";

    if (normalizeNotePageTitle(selectedPage?.title) === normalizedDraft) {
      setPageTitleDraft(normalizedDraft);
      setPageTitleError(null);
      return;
    }

    const isAvailable = await isNotePageTitleAvailable(normalizedDraft, selectedPageId);
    if (!isAvailable) {
      setPageTitleError("Page titles must be unique.");
      setPageTitleDraft(selectedPage?.title ?? "");
      return;
    }

    setPageTitleError(null);
    setPageTitleDraft(normalizedDraft);
    updateNotePageTitle(selectedPageId, normalizedDraft);
  };

  const handleToggleFavorite = () => {
    if (!selectedPageId) return;

    updateNotePageProperties(selectedPageId, {
      ...(selectedPageProperties as PagePropertiesRecord),
      favorite: selectedPageProperties.favorite !== true,
    });
  };

  const handleSelectPageEmoji = (emoji: string | null) => {
    setPageEmojiDraft(emoji);
    persistSelectedPageProperties(summaryDraft, selectedTagIdsDraft, emoji);
    setIsEmojiPickerOpen(false);
  };

  const togglePageFavorite = (page: NormalizedNotePage) => {
    const pageProperties = parseProperties(page.properties);

    updateNotePageProperties(page.id, {
      ...(pageProperties as PagePropertiesRecord),
      favorite: pageProperties.favorite !== true,
    });
  };

  const handleDeletePage = async () => {
    if (!selectedPageId) return;

    setIsDeletingPage(true);

    try {
      await deleteNotePage(selectedPageId);
      onDeleteSuccess();
    } finally {
      setIsDeletingPage(false);
      setIsDeleteDialogOpen(false);
    }
  };

  const handleCopyDocument = async () => {
    if (!selectedPage) return;

    const lines = [`${activePageEmoji ? `${activePageEmoji} ` : ""}${selectedPage.title?.trim() || "Untitled page"}`];

    if (selectedPageSummary?.trim()) {
      lines.push("", selectedPageSummary.trim());
    }

    if (selectedPageTags.length > 0) {
      lines.push("", `Tags: ${selectedPageTags.map((tag) => `#${tag.name}`).join(", ")}`);
    }

    const blockLines = orderedVisibleBlockIds
      .map((blockId) => {
        const serialized = selectedBlockMap.get(blockId)?.content ?? null;
        return extractNoteText(serialized);
      })
      .filter((text) => text.length > 0);

    if (blockLines.length > 0) {
      lines.push("", ...blockLines.map((text) => `- ${text}`));
    }

    await navigator.clipboard.writeText(lines.join("\n"));
  };

  return {
    commitPageTitleDraft,
    handleCopyDocument,
    handleDeletePage,
    handleSelectPageEmoji,
    handleToggleFavorite,
    persistSelectedPageProperties,
    togglePageFavorite,
  };
}
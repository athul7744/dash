"use client";

import { useQuery } from "@powersync/react";
import { useMemo } from "react";

import type { NotePageRow } from "@/hooks/use-notes";
import { normalizeNotePageTitle } from "@/lib/notes/notes";
import type { Tag } from "@/lib/powersync/AppSchema";

import { type NormalizedNotePage, type TagDirectoryEntry } from "./types";
import { getPageDescription, normalizePageEmoji, parseProperties, parseStoredTagIds, resolveNoteTags } from "./utils";

type UseNotesPageDerivedStateParams = {
  allPages: NotePageRow[];
  recentPages: NotePageRow[];
  /** Full favorites set (see useFavoriteNotePages). Optional for consumers (e.g. search) that don't render favorites. */
  favoritePageRows?: NotePageRow[];
  pageSearchQuery: string;
};

function normalizePages(pages: NotePageRow[], availableTags: Tag[]): NormalizedNotePage[] {
  return pages.map((page) => {
    const properties = parseProperties(page.properties);
    const tags = resolveNoteTags(parseStoredTagIds(properties.tags), availableTags);

    return {
      ...page,
      summary: getPageDescription(page.properties, page.preview_content),
      tags,
      emoji: normalizePageEmoji(properties.emoji),
    };
  });
}

export function useNotesPageDerivedState({
  allPages,
  recentPages,
  favoritePageRows = [],
  pageSearchQuery,
}: UseNotesPageDerivedStateParams) {
  const { data: availableTags = [] } = useQuery<Tag>("SELECT * FROM tags ORDER BY name ASC");

  const normalizedPages = useMemo<NormalizedNotePage[]>(
    () => normalizePages(recentPages, availableTags),
    [availableTags, recentPages]
  );

  const allNormalizedPages = useMemo<NormalizedNotePage[]>(
    () => normalizePages(allPages, availableTags),
    [allPages, availableTags]
  );

  const notePageTitles = useMemo(() => {
    const seenTitles = new Set<string>();

    return allPages.flatMap((page) => {
      const normalizedTitle = normalizeNotePageTitle(page.title) || "Untitled";
      const key = normalizedTitle.toLocaleLowerCase();

      if (seenTitles.has(key)) {
        return [];
      }

      seenTitles.add(key);
      return [normalizedTitle];
    });
  }, [allPages]);

  const notePageIdByTitle = useMemo(() => {
    const titleMap = new Map<string, string>();

    allPages.forEach((page) => {
      const normalizedTitle = normalizeNotePageTitle(page.title) || "Untitled";
      const key = normalizedTitle.toLocaleLowerCase();

      if (!titleMap.has(key)) {
        titleMap.set(key, page.id);
      }
    });

    return titleMap;
  }, [allPages]);

  const normalizedSearchQuery = useMemo(
    () => normalizeNotePageTitle(pageSearchQuery),
    [pageSearchQuery]
  );

  const filteredSearchPages = useMemo(() => {
    const nextQuery = normalizedSearchQuery.toLocaleLowerCase();

    if (!nextQuery) {
      return allNormalizedPages;
    }

    return allNormalizedPages.filter((page) => {
      const title = (normalizeNotePageTitle(page.title) || "Untitled").toLocaleLowerCase();
      const summary = (page.summary ?? "").toLocaleLowerCase();
      const tags = page.tags.map((tag) => tag.name).join(" ").toLocaleLowerCase();
      return title.includes(nextQuery) || summary.includes(nextQuery) || tags.includes(nextQuery);
    });
  }, [allNormalizedPages, normalizedSearchQuery]);

  const exactSearchMatch = useMemo(
    () => notePageIdByTitle.get(normalizedSearchQuery.toLocaleLowerCase()) ?? null,
    [notePageIdByTitle, normalizedSearchQuery]
  );

  // All favorites, sourced from a dedicated query so they are not capped by the
  // recent-pages window (see useFavoriteNotePages).
  const favoritePages = useMemo<NormalizedNotePage[]>(
    () => normalizePages(favoritePageRows, availableTags),
    [availableTags, favoritePageRows]
  );

  const tagDirectory = useMemo<TagDirectoryEntry[]>(() => {
    const tagMap = new Map<string, TagDirectoryEntry>();

    normalizedPages.forEach((page) => {
      page.tags.forEach((tag) => {
        const entry = tagMap.get(tag.key);

        if (entry) {
          entry.count += 1;
          entry.pages.push(page);
          return;
        }

        tagMap.set(tag.key, {
          key: tag.key,
          label: tag.name,
          color: tag.color,
          count: 1,
          pages: [page],
        });
      });
    });

    return Array.from(tagMap.values()).sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    });
  }, [normalizedPages]);

  const recentAccessPages = useMemo(
    () => normalizedPages.filter((page) => {
      const properties = parseProperties(page.properties);
      return properties.favorite !== true;
    }),
    [normalizedPages]
  );

  return {
    allNormalizedPages,
    canCreatePageFromSearch: normalizedSearchQuery.length > 0 && !exactSearchMatch,
    favoritePages,
    filteredSearchPages,
    normalizedPages,
    normalizedSearchQuery,
    notePageIdByTitle,
    notePageTitles,
    recentAccessPages,
    tagDirectory,
  };
}
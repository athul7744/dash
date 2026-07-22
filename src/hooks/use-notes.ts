"use client";

import { useQuery } from "@powersync/react";

import type { AttachmentRecord, BlockRecord, PageRecord } from "@/lib/powersync/AppSchema";

type NoteCountRow = { count: number };

export type NotePageRow = PageRecord & { id: string; preview_content?: string | null };
export type NoteBlockRow = BlockRecord & { id: string };
export type NoteAttachmentRow = AttachmentRecord & { id: string };
export type LinkedNoteReferenceRow = {
  source_block_id: string;
  source_page_id: string;
  source_page_title: string | null;
  source_block_content: string | null;
  source_block_updated_at: string | null;
  source_page_properties: string | null;
};

const EMPTY_PAGE_QUERY = "SELECT id, user_id, title, properties, created_at, updated_at FROM pages WHERE 1 = 0";
const EMPTY_BLOCKS_QUERY = "SELECT id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at FROM blocks WHERE 1 = 0";
const EMPTY_ATTACHMENTS_QUERY = "SELECT id, user_id, page_id, block_id, file_path, sync_state FROM attachments WHERE 1 = 0";
const EMPTY_LINKED_REFS_QUERY = [
  "SELECT DISTINCT",
  "  e.source_block_id AS source_block_id,",
  "  b.page_id AS source_page_id,",
  "  p.title AS source_page_title,",
  "  b.content AS source_block_content,",
  "  b.updated_at AS source_block_updated_at",
  "FROM edges e",
  "JOIN blocks b ON b.id = e.source_block_id",
  "JOIN pages p ON p.id = b.page_id",
  "WHERE 1 = 0",
].join(" ");

export function useNotePage(pageId?: string | null) {
  const query = pageId
    ? "SELECT id, user_id, title, properties, created_at, updated_at FROM pages WHERE id = ? LIMIT 1"
    : EMPTY_PAGE_QUERY;
  const args = pageId ? [pageId] : [];
  const { data = [], isLoading } = useQuery<NotePageRow>(query, args);

  return {
    page: data[0] ?? null,
    isLoading
  };
}

export function useNoteBlocks(pageId?: string | null) {
  const query = pageId
    ? [
        "SELECT id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at",
        "FROM blocks",
        "WHERE page_id = ?",
        "ORDER BY sort_rank ASC"
      ].join(" ")
    : EMPTY_BLOCKS_QUERY;
  const args = pageId ? [pageId] : [];
  const { data = [], isLoading } = useQuery<NoteBlockRow>(query, args);

  return {
    blocks: data,
    isLoading
  };
}

export function useNoteCounts() {
  const { data: pageRows = [], isLoading: isLoadingPages } = useQuery<NoteCountRow>(
    "SELECT COUNT(*) AS count FROM pages"
  );
  const { data: blockRows = [], isLoading: isLoadingBlocks } = useQuery<NoteCountRow>(
    "SELECT COUNT(*) AS count FROM blocks"
  );
  const { data: edgeRows = [], isLoading: isLoadingEdges } = useQuery<NoteCountRow>(
    "SELECT COUNT(*) AS count FROM edges"
  );

  return {
    pageCount: pageRows[0]?.count ?? 0,
    blockCount: blockRows[0]?.count ?? 0,
    edgeCount: edgeRows[0]?.count ?? 0,
    isLoading: isLoadingPages || isLoadingBlocks || isLoadingEdges
  };
}

export function useRecentNotePages(limit = 8) {
  const { data = [], isLoading } = useQuery<NotePageRow>(
    [
      "SELECT id, user_id, title, properties, created_at, updated_at,",
      "  (SELECT content",
      "   FROM blocks",
      "   WHERE page_id = pages.id",
      "   ORDER BY sort_rank ASC",
      "   LIMIT 1) AS preview_content",
      "FROM pages",
      "WHERE json_extract(properties, '$.kind') IS NULL",
      "ORDER BY updated_at DESC, created_at DESC",
      "LIMIT ?"
    ].join(" "),
    [limit]
  );

  return {
    pages: data,
    isLoading
  };
}

export function useFavoriteNotePages() {
  const { data = [], isLoading } = useQuery<NotePageRow>(
    [
      "SELECT id, user_id, title, properties, created_at, updated_at,",
      "  (SELECT content",
      "   FROM blocks",
      "   WHERE page_id = pages.id",
      "   ORDER BY sort_rank ASC",
      "   LIMIT 1) AS preview_content",
      "FROM pages",
      "WHERE json_extract(properties, '$.kind') IS NULL",
      "  AND json_extract(properties, '$.favorite') = 1",
      "ORDER BY updated_at DESC, created_at DESC"
    ].join(" "),
  );

  return {
    pages: data,
    isLoading
  };
}

export function useAllNotePages() {
  const { data = [], isLoading } = useQuery<NotePageRow>(
    [
      "SELECT id, user_id, title, properties, created_at, updated_at,",
      "  (SELECT content",
      "   FROM blocks",
      "   WHERE page_id = pages.id",
      "   ORDER BY sort_rank ASC",
      "   LIMIT 1) AS preview_content",
      "FROM pages",
      "WHERE json_extract(properties, '$.kind') IS NULL",
      "ORDER BY title COLLATE NOCASE ASC, updated_at DESC, created_at DESC"
    ].join(" ")
  );

  return {
    pages: data,
    isLoading,
  };
}

export function usePageAttachments(pageId?: string | null) {
  const query = pageId
    ? "SELECT id, user_id, page_id, block_id, file_path, sync_state FROM attachments WHERE page_id = ? ORDER BY id ASC"
    : EMPTY_ATTACHMENTS_QUERY;
  const args = pageId ? [pageId] : [];
  const { data = [], isLoading } = useQuery<NoteAttachmentRow>(query, args);

  return {
    attachments: data,
    isLoading
  };
}

export function useLinkedNoteReferences(pageId?: string | null) {
  const query = pageId
    ? [
        "SELECT DISTINCT",
        "  e.source_block_id AS source_block_id,",
        "  b.page_id AS source_page_id,",
        "  p.title AS source_page_title,",
        "  p.properties AS source_page_properties,",
        "  b.content AS source_block_content,",
        "  b.updated_at AS source_block_updated_at",
        "FROM edges e",
        "JOIN blocks b ON b.id = e.source_block_id",
        "JOIN pages p ON p.id = b.page_id",
        // Note → note only (both legacy `page_ref` and id-bound `ref`). Cross-app
        // sources (tasks/bookmarks/…) surface via the <Backlinks> chip row.
        "WHERE e.type IN ('ref', 'page_ref') AND e.target_id = ? AND json_extract(p.properties, '$.kind') IS NULL",
        "ORDER BY b.updated_at DESC, e.source_block_id DESC",
      ].join(" ")
    : EMPTY_LINKED_REFS_QUERY;
  const args = pageId ? [pageId] : [];
  const { data = [], isLoading } = useQuery<LinkedNoteReferenceRow>(query, args);

  return {
    references: data,
    isLoading,
  };
}

export function useNotePageWithBlocks(pageId?: string | null) {
  const pageState = useNotePage(pageId);
  const blocksState = useNoteBlocks(pageId);

  return {
    page: pageState.page,
    blocks: blocksState.blocks,
    isLoading: pageState.isLoading || blocksState.isLoading
  };
}
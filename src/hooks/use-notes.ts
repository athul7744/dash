"use client";

import { useQuery } from "@powersync/react";

import type { AttachmentRecord, BlockRecord, EdgeRecord, PageRecord } from "@/lib/powersync/AppSchema";

type NoteCountRow = { count: number };

export type NotePageRow = PageRecord & { id: string; preview_content?: string | null };
export type NoteBlockRow = BlockRecord & { id: string };
export type NoteEdgeRow = EdgeRecord & { id: string };
export type NoteAttachmentRow = AttachmentRecord & { id: string };
export type LinkedNoteReferenceRow = {
  source_block_id: string;
  source_page_id: string;
  source_page_title: string | null;
  source_block_content: string | null;
  source_block_updated_at: string | null;
  source_page_properties: string | null;
};
export type NoteTagMentionRow = {
  tag_name: string;
  mention_count: number;
};

const EMPTY_PAGE_QUERY = "SELECT id, user_id, title, properties, created_at, updated_at FROM pages WHERE 1 = 0";
const EMPTY_BLOCKS_QUERY = "SELECT id, user_id, page_id, parent_block_id, type, content, sort_rank, updated_at FROM blocks WHERE 1 = 0";
const EMPTY_EDGES_QUERY = "SELECT id, source_block_id, target_id, user_id, type FROM edges WHERE 1 = 0";
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
const EMPTY_TAG_MENTIONS_QUERY = "SELECT '' AS tag_name, 0 AS mention_count WHERE 1 = 0";

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

export function useBlockAttachments(blockId?: string | null) {
  const query = blockId
    ? "SELECT id, user_id, page_id, block_id, file_path, sync_state FROM attachments WHERE block_id = ? ORDER BY id ASC"
    : EMPTY_ATTACHMENTS_QUERY;
  const args = blockId ? [blockId] : [];
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
        "WHERE e.type = 'page_ref' AND e.target_id = ?",
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

export function usePageTagMentions(pageId?: string | null) {
  const query = pageId
    ? [
        "SELECT",
        "  substr(e.target_id, 5) AS tag_name,",
        "  COUNT(*) AS mention_count",
        "FROM edges e",
        "JOIN blocks b ON b.id = e.source_block_id",
        "WHERE e.type = 'tag_ref' AND b.page_id = ?",
        "GROUP BY e.target_id",
        "ORDER BY mention_count DESC, tag_name ASC",
      ].join(" ")
    : EMPTY_TAG_MENTIONS_QUERY;
  const args = pageId ? [pageId] : [];
  const { data = [], isLoading } = useQuery<NoteTagMentionRow>(query, args);

  return {
    tags: data,
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
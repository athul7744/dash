"use client";

/**
 * Drives one Tiptap editor for a whole notes page from the PowerSync block rows.
 *
 * - Builds the editor once per page from `assembleDoc(rows)`.
 * - Every edit schedules a debounced save through `BlockDocumentPersister`.
 * - Incoming row changes reconcile into the open document (local-dirty
 *   precedence); flushes and disposes on page change / unmount.
 *
 * The component mounts this with `key={pageId}`, so a page switch remounts the
 * hook rather than mutating `pageId` in place.
 *
 * This is the minimal runnable mount: block chrome (drag handle, context menu),
 * slash commands, page-ref click/hover, block-clipboard paste, and the query
 * NodeView are layered on afterwards.
 */

import { useEffect, useMemo, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { useEditor } from "@tiptap/react";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { db } from "@/lib/powersync/db";

import { assembleDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { BlockDocumentPersister } from "@/lib/notes/editor/block-persister";
import { buildNoteEditorExtensions } from "@/lib/notes/editor/extensions";
import { STAMP_META } from "@/lib/notes/editor/block-id-plugin";

const SQL_UTC_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

function toBlockDocumentRow(block: NoteBlockRow): BlockDocumentRow {
  return {
    id: block.id,
    parent_block_id: block.parent_block_id ?? null,
    sort_rank: block.sort_rank ?? "",
    type: block.type ?? "text",
    content: block.content ?? "{}",
  };
}

export function useSingleBlockEditor({ pageId, blocks }: { pageId: string; blocks: NoteBlockRow[] }): Editor | null {
  const rows = useMemo(() => blocks.map(toBlockDocumentRow), [blocks]);

  const latestRowsRef = useRef(rows);
  const editorRef = useRef<Editor | null>(null);
  const persisterRef = useRef<BlockDocumentPersister | null>(null);

  useEffect(() => {
    latestRowsRef.current = rows;
  });

  // Initial content is captured once per mount (pageId is stable per mount).
  const initialContent = useMemo(
    () => assembleDoc(rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: false,
    extensions: buildNoteEditorExtensions(),
    content: initialContent,
    editorProps: {
      attributes: {
        // pl-7 keeps root-block grips (positioned in the left margin) within the
        // reading column instead of off the viewport edge.
        class: "outline-none focus:outline-none pl-7",
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Persister lifecycle: create per page, flush + dispose on unmount.
  useEffect(() => {
    const persister = new BlockDocumentPersister(pageId, {
      getDoc: () => editorRef.current?.getJSON() ?? { type: "doc", content: [] },
      onPersisted: async () => {
        await db.execute(`UPDATE pages SET updated_at = ${SQL_UTC_NOW} WHERE id = ?`, [pageId]);
      },
    });
    persisterRef.current = persister;
    return () => {
      void persister.flush();
      persister.dispose();
      persisterRef.current = null;
    };
  }, [pageId]);

  // Baseline the snapshot from the editor's own serialization once it's ready,
  // so an unedited load never looks "dirty". Must run before the reconcile
  // effect below.
  useEffect(() => {
    if (editor && persisterRef.current) {
      persisterRef.current.hydrateFromDoc(editor.getJSON(), latestRowsRef.current);
    }
  }, [editor]);

  // Schedule a debounced save on genuine edits only. Skip programmatic
  // transactions: the id-stamping pass (STAMP_META) and the remote-reconcile
  // replacement (addToHistory:false). Everything else — typing, grip-menu
  // actions — is a real edit and saves.
  useEffect(() => {
    if (!editor) return;
    const onUpdate = ({ transaction }: { transaction: { getMeta: (key: string) => unknown } }) => {
      if (transaction.getMeta(STAMP_META) || transaction.getMeta("addToHistory") === false) return;
      persisterRef.current?.markChanged();
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor]);

  // Reconcile remote row changes into the open document.
  useEffect(() => {
    if (editor && persisterRef.current) persisterRef.current.reconcileRemote(editor, rows);
  }, [editor, rows]);

  return editor;
}

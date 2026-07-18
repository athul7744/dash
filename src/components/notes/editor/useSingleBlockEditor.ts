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
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";

import type { NoteBlockRow } from "@/hooks/use-notes";
import { db } from "@/lib/powersync/db";

import { assembleDoc, type BlockDocumentRow } from "@/lib/notes/editor/block-document";
import { BlockDocumentPersister } from "@/lib/notes/editor/block-persister";
import { buildNoteEditorExtensions } from "@/lib/notes/editor/extensions";
import { STAMP_META } from "@/lib/notes/editor/block-id-plugin";
import { splitBlock, indentBlock, outdentBlock, mergeBlockBackward } from "@/lib/notes/editor/block-commands";
import { insertMarkdown, clipboardMarkdown } from "@/lib/notes/editor/markdown-paste";
import { getResolvedPageReferenceAtPosition } from "@/lib/notes/editor-document-helpers";

export type SingleBlockEditorHandlers = {
  notePageTitles: string[];
  notePageEmojiByTitle?: Record<string, string | null>;
  onOpenPageReference?: (title: string) => void;
  onPeekPageReference?: (title: string, rect: DOMRect) => void;
};

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

export function useSingleBlockEditor({
  pageId,
  blocks,
  handlers,
  autoFocus = false,
}: {
  pageId: string;
  blocks: NoteBlockRow[];
  handlers?: SingleBlockEditorHandlers;
  autoFocus?: boolean;
}): Editor | null {
  const rows = useMemo(() => blocks.map(toBlockDocumentRow), [blocks]);

  const latestRowsRef = useRef(rows);
  const editorRef = useRef<Editor | null>(null);
  const persisterRef = useRef<BlockDocumentPersister | null>(null);

  // Editor is created once per page; page-reference handlers read the latest
  // titles/callbacks through a ref so they never go stale.
  const handlersRef = useRef<SingleBlockEditorHandlers | undefined>(handlers);
  const pointerTypeRef = useRef<"mouse" | "touch">("mouse");
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latestRowsRef.current = rows;
  });
  useEffect(() => {
    handlersRef.current = handlers;
  });
  useEffect(() => () => {
    if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
  }, []);

  // Resolve a page reference under a DOM node, but only if it points at a page
  // that exists (unknown [[titles]] stay inert plain text).
  const resolveRef = (view: EditorView, el: HTMLElement) => {
    const refSpan = el.closest?.(".note-ref-token-page") as HTMLElement | null;
    if (!refSpan) return null;
    const editor = editorRef.current;
    if (!editor) return null;
    const reference = getResolvedPageReferenceAtPosition(editor, view.posAtDOM(refSpan, 0));
    if (!reference) return null;
    const titles = handlersRef.current?.notePageTitles ?? [];
    const canOpen = titles.some((t) => t.localeCompare(reference.title, undefined, { sensitivity: "accent" }) === 0);
    if (!canOpen) return null;
    return { title: reference.title, rect: refSpan.getBoundingClientRect() };
  };

  // Initial content is captured once per mount (pageId is stable per mount).
  const initialContent = useMemo(
    () => assembleDoc(rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId],
  );

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    extensions: buildNoteEditorExtensions(),
    content: initialContent,
    editorProps: {
      attributes: {
        // pl-7 keeps root-block grips (positioned in the left margin) within the
        // reading column instead of off the viewport edge.
        class: "outline-none focus:outline-none pl-7",
      },
      // Structural keys are handled here, in the view's direct props, which
      // ProseMirror checks BEFORE any plugin keymap (base keymap, task-list /
      // blockquote ListKeymap). That ordering is essential: block-level exits
      // must beat the native list lift/joinBackward. Each command returns false
      // when it doesn't apply, so the key then falls through to those plugins.
      handleKeyDown(view, event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        const dispatch = view.dispatch.bind(view);
        if (event.key === "Enter" && !event.shiftKey) return splitBlock(view.state, dispatch);
        if (event.key === "Tab") return (event.shiftKey ? outdentBlock : indentBlock)(view.state, dispatch);
        if (event.key === "Backspace" && !event.shiftKey) return mergeBlockBackward(view.state, dispatch);
        return false;
      },
      // Parse pasted raw markdown text into blocks. Rich HTML and non-markdown
      // text fall through to native paste (return false).
      handlePaste(view, event) {
        const markdown = clipboardMarkdown(event.clipboardData);
        if (!markdown) return false;
        const inserted = insertMarkdown(view, markdown);
        if (inserted) event.preventDefault();
        return inserted;
      },
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          // Suppress caret placement inside a live [[ref]] so the click opens it.
          if (resolveRef(view, target)) event.preventDefault();
          return false;
        },
        touchstart(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          const hit = resolveRef(view, target);
          if (!hit) return false;
          event.preventDefault();
          pointerTypeRef.current = "touch";
          handlersRef.current?.onPeekPageReference?.(hit.title, hit.rect);
          return true;
        },
        click(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          const hit = resolveRef(view, target);
          if (!hit) return false;
          event.preventDefault();
          // Touch shows the peek popover; mouse navigates straight through.
          if (pointerTypeRef.current === "touch" && handlersRef.current?.onPeekPageReference) {
            handlersRef.current.onPeekPageReference(hit.title, hit.rect);
          } else {
            handlersRef.current?.onOpenPageReference?.(hit.title);
          }
          return true;
        },
        mouseover(view, event) {
          if (pointerTypeRef.current === "touch") return false;
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          const hit = resolveRef(view, target);
          if (!hit) return false;
          if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
          peekTimeoutRef.current = setTimeout(() => {
            handlersRef.current?.onPeekPageReference?.(hit.title, hit.rect);
          }, 350);
          return false;
        },
        mouseout(_view, event) {
          const target = event.target;
          if (target instanceof HTMLElement && target.closest?.(".note-ref-token-page") && peekTimeoutRef.current) {
            clearTimeout(peekTimeoutRef.current);
            peekTimeoutRef.current = null;
          }
          return false;
        },
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

"use client";

/**
 * Assembles the extension list for the single-document notes editor.
 *
 * Every existing content node/mark is reused unchanged except that block-level
 * content nodes are re-grouped into `blockContent` (via `asBlockContent`) so
 * they live only inside a `block` wrapper, never directly under the document.
 * Inline nodes/marks, table cells, task items, and math-inline keep their
 * groups. The `block` node, structural keymap, and stable-id plugin are added
 * on top; `History` gives one native undo timeline for the whole page.
 *
 * Not yet included (added as the editor UI is built): slash commands, page-ref
 * click/hover handling, block-clipboard paste, the query-block node, and the
 * block drag-handle/context-menu NodeView.
 */

import type { Extensions } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Text from "@tiptap/extension-text";
import { common, createLowlight } from "lowlight";

import { CodeBlockWithToolbar } from "@/components/notes/NoteBlockEditorCode";
import { BlockColor } from "@/components/notes/NoteBlockEditorColor";
import {
  DateAutoFormat,
  MarkdownLink,
  NotesArrowReplacement,
  NotesHorizontalRule,
  ReferenceDecorations,
} from "@/components/notes/NoteBlockEditorExtensions";
import { MathBlock, MathInline } from "@/components/notes/NoteBlockEditorMath";
import { QueryBlock } from "@/components/notes/editor/QueryBlockNode";
import { TaskLine } from "@/components/notes/editor/TaskLineNode";
import { createBlockNodeView } from "@/components/notes/editor/blockNodeViewDom";

import { NotesDocument, BlockNode, asBlockContent, BLOCK_CONTENT_GROUP } from "./block-schema";
import { BlockIdPlugin } from "./block-id-plugin";
import { BlockNormalize } from "./block-normalize";

export function buildNoteEditorExtensions(): Extensions {
  const lowlight = createLowlight(common);

  const Table_ = Table.extend({
    renderHTML({ HTMLAttributes }) {
      return ["table", HTMLAttributes, ["tbody", 0]];
    },
  }).configure({ resizable: false });

  return [
    // Document + block wrapper (plain-DOM NodeView; menu via BlockMenuLayer).
    NotesDocument,
    BlockNode.extend({
      addNodeView() {
        return (props) => createBlockNodeView(props);
      },
    }),

    // Block-level content nodes — re-grouped so they only live inside a block.
    asBlockContent(Paragraph),
    asBlockContent(Heading.configure({ levels: [1, 2, 3, 4, 5] })),
    // Containers whose default content targets the "block" group must instead
    // hold `blockContent` — the group content nodes were regrouped into — or
    // they hold no valid children and structural ops (canSplit) throw.
    asBlockContent(Blockquote.extend({ content: `${BLOCK_CONTENT_GROUP}+` })),
    asBlockContent(CodeBlockWithToolbar.configure({ lowlight })),
    asBlockContent(Image),
    asBlockContent(NotesHorizontalRule),
    asBlockContent(Table_),
    asBlockContent(MathBlock),
    TaskLine,
    QueryBlock,

    // Inline nodes / marks / table + task children — unchanged.
    Text,
    Bold,
    Italic,
    Strike,
    Code,
    HardBreak,
    MathInline,
    TableRow,
    TableHeader.extend({ content: `${BLOCK_CONTENT_GROUP}+` }),
    TableCell.extend({ content: `${BLOCK_CONTENT_GROUP}+` }),

    // Cross-cutting behavior.
    BlockColor,
    MarkdownLink,
    NotesArrowReplacement,
    DateAutoFormat,
    ReferenceDecorations,
    Dropcursor,
    Gapcursor,
    History,

    // Single-document structural behavior. (Enter/Tab/Backspace are handled in
    // the editor's handleKeyDown so they run before plugin keymaps.)
    BlockIdPlugin,
    BlockNormalize,
  ];
}

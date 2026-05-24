"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Extension, InputRule, markInputRule, markPasteRule, type Editor, type JSONContent } from "@tiptap/core";
import { Link2, Minus, Plus, Rows3, Trash2 } from "lucide-react";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import Code from "@tiptap/extension-code";
import Document from "@tiptap/extension-document";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import Text from "@tiptap/extension-text";
import { common, createLowlight } from "lowlight";
import { marked } from "marked";
import { CellSelection, findCellPos } from "prosemirror-tables";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  createScaffoldDocument,
  emptyDocument,
  emptyHorizontalRuleDocument,
  emptyTaskListDocument,
  getFilteredSlashCommands,
  getGroupedSlashCommands,
  getSlashQuery,
  type SlashCommand,
} from "@/components/notes/NoteBlockEditorSlash";
import { MathInline, MathBlock } from "@/components/notes/NoteBlockEditorMath";
import { protectMathTokens, restoreMathTokens } from "@/lib/notes/math-clipboard";
import {
  getBlockArrowMoveAction,
  getBlockBackspaceAction,
  getBlockEnterAction,
  getBlockTabAction,
  getSplitSiblingOptions,
  shouldNavigateBetweenBlocks,
} from "@/lib/notes/block-editor-keyboard";
import { NOTES_BLOCK_CLIPBOARD_MIME, parseBlockClipboardData } from "@/lib/notes/block-line-selection";
import { parseClipboardMarkdown, shouldReplaceOnMarkdownPaste } from "@/lib/notes/markdown-clipboard-blocks";
import { createNoteDocumentFromText, extractNoteText, normalizeNoteDocument, serializeNoteDocumentToMarkdown } from "@/lib/notes/notes-content";
import type { NoteBlockInsert } from "@/lib/notes/notes";
import { logger } from "@/lib/shared/logger";

const referenceDecorationsKey = new PluginKey("noteReferenceDecorations");
const markdownLinkInputRegex = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)$/;
const markdownLinkPasteRegex = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)/g;
const markdownImageBlockRegex = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]+)")?\)$/;
const markdownBlockHintRegex = /(^|\n)\s*(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~|\|.+\||!\[[^\]]*\]\(|\[[^\]]+\]\([^\)]+\)|-{3,}|\*\*[^*]+\*\*|_[^_]+_)/;
const markdownLinkOrImageRegex = /!\[[^\]]*\]\([^\)]+\)|\[[^\]]+\]\([^\)]+\)/;
const markdownTableSeparatorRegex = /(^|\n)\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*($|\n)/;
const markdownTaskListRegex = /(^|\n)\s*[-*+]\s\[[ xX]\]\s/;
const markdownMathRegex = /\$\$[^\$]+\$\$|\$[^\$\s][^\$]*?\$/;
const notePageReferenceRegex = /\[\[[^\]]+\]\]/g;
const noteInlineTagRegex = /(^|[\s(])#([a-z0-9][a-z0-9_/-]*)/gi;
const lowlight = createLowlight(common);

type TableToolbarState = {
  visible: boolean;
  canAddColumn: boolean;
  canDeleteColumn: boolean;
  canAddRow: boolean;
  canDeleteRow: boolean;
  canDeleteTable: boolean;
};

type TableToolbarPosition = {
  top: number;
  right: number;
};

const hiddenTableToolbarState: TableToolbarState = {
  visible: false,
  canAddColumn: false,
  canDeleteColumn: false,
  canAddRow: false,
  canDeleteRow: false,
  canDeleteTable: false,
};

const visibleTableToolbarState: TableToolbarState = {
  visible: true,
  canAddColumn: true,
  canDeleteColumn: true,
  canAddRow: true,
  canDeleteRow: true,
  canDeleteTable: true,
};

const turndownService = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx",
});

turndownService.use(gfm);
turndownService.addRule("taskListItems", {
  filter(node: Node) {
    return node.nodeName === "LI" && (node as HTMLElement).getAttribute("data-type") === "taskItem";
  },
  replacement(content: string, node: Node) {
    const element = node as HTMLElement;
    const checkbox = element.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const isChecked = checkbox?.checked || element.getAttribute("data-checked") === "true";
    const normalizedContent = content.replace(/^\s*\[[ xX]\]\s*/, "").trim();
    return `\n- [${isChecked ? "x" : " "}] ${normalizedContent}\n`;
  },
});
turndownService.addRule("mathInline", {
  filter(node: Node) {
    return node.nodeName === "SPAN" && (node as HTMLElement).hasAttribute("data-math-inline");
  },
  replacement(_content: string, node: Node) {
    const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
    return `$${latex}$`;
  },
});
turndownService.addRule("mathBlock", {
  filter(node: Node) {
    return node.nodeName === "DIV" && (node as HTMLElement).hasAttribute("data-math-block");
  },
  replacement(_content: string, node: Node) {
    const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
    return `\n\n$$${latex}$$\n\n`;
  },
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function protectNoteTokens(text: string) {
  const tokens: string[] = [];
  const createPlaceholder = (value: string) => {
    const index = tokens.push(value) - 1;
    return `NOTESCLIPTOK${index}END`;
  };

  const withProtectedReferences = text.replace(notePageReferenceRegex, (match) => createPlaceholder(match));
  const protectedText = withProtectedReferences.replace(noteInlineTagRegex, (_, prefix: string, tag: string) => `${prefix}${createPlaceholder(`#${tag}`)}`);

  return { protectedText, tokens };
}

function restoreProtectedTokens(value: string, tokens: string[], escape = false) {
  return value.replace(/NOTESCLIPTOK(\d+)END/g, (_, index: string) => {
    const token = tokens[Number(index)] ?? "";
    return escape ? escapeHtml(token) : token;
  });
}

function normalizeExportedMarkdownTokens(markdown: string) {
  return markdown
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]")
    .replace(/(^|[\s(])\\#([a-z0-9][a-z0-9_/-]*)/gi, "$1#$2");
}

function getTableToolbarState(editor: Editor | null): TableToolbarState {
  if (!editor || !editor.isActive("table")) {
    return hiddenTableToolbarState;
  }

  const canDelete = editor.can().deleteColumn();
  const canDeleteRow = editor.can().deleteRow();

  if (!editor.isFocused || !canDelete || !canDeleteRow) {
    return {
      visible: editor.isFocused,
      canAddColumn: true,
      canDeleteColumn: canDelete,
      canAddRow: true,
      canDeleteRow: canDeleteRow,
      canDeleteTable: true,
    };
  }

  return visibleTableToolbarState;
}

function getTableToolbarPosition(editor: Editor | null, container: HTMLElement | null): TableToolbarPosition | null {
  if (!editor || !container || !editor.isActive("table")) {
    return null;
  }

  let selectionNode: Node | null = editor.view.nodeDOM(editor.state.selection.from);

  if (selectionNode?.nodeType === Node.TEXT_NODE) {
    selectionNode = selectionNode.parentElement;
  }

  if (!(selectionNode instanceof HTMLElement)) {
    return null;
  }

  const rowElement = selectionNode.closest("tr");
  if (!(rowElement instanceof HTMLElement)) {
    return null;
  }

  const containerRect = container.getBoundingClientRect();
  const rowRect = rowElement.getBoundingClientRect();

  return {
    top: rowRect.top - containerRect.top + rowRect.height / 2,
    right: Math.max(containerRect.right - rowRect.right + 8, 8),
  };
}

function getFocusedTableCellPos(editor: Editor | null): number | null {
  if (!editor || !editor.isActive("table")) {
    return null;
  }

  const { doc, selection } = editor.state;

  if (selection instanceof CellSelection) {
    return selection.$headCell.pos;
  }

  try {
    return findCellPos(doc, selection.head)?.pos ?? null;
  } catch {
    return null;
  }
}

function runTableActionAtFocusedCell(
  editor: Editor,
  focusedCellPos: number | null,
  action: () => boolean
) {
  const cellPos = focusedCellPos ?? getFocusedTableCellPos(editor);

  if (cellPos !== null) {
    // Place a text cursor inside the target cell so prosemirror-tables
    // commands (which use selectionCell → findCell) operate on the
    // correct column/row.  No CellSelection needed for single-cell ops.
    const $cell = editor.state.doc.resolve(cellPos);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.near($cell))
    );
    editor.view.focus();
  } else {
    editor.commands.focus();
  }

  return action();
}

function getMarkdownClipboardText(event: ClipboardEvent) {
  const explicitMarkdown = event.clipboardData?.getData("text/markdown")?.trim() ?? "";
  if (explicitMarkdown) {
    return explicitMarkdown;
  }

  const clipboardText = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (!clipboardText) {
    return null;
  }

  const lineCount = clipboardText.split(/\r?\n/).length;
  const hasMarkdownLinkOrImage = markdownLinkOrImageRegex.test(clipboardText);
  const hasMarkdownTable = markdownTableSeparatorRegex.test(clipboardText);
  const hasTaskList = markdownTaskListRegex.test(clipboardText);
  const hasBlockSyntax = markdownBlockHintRegex.test(clipboardText);
  const hasMath = markdownMathRegex.test(clipboardText);

  if (hasMarkdownLinkOrImage || hasMarkdownTable || hasTaskList || hasMath) {
    return clipboardText;
  }

  if (lineCount > 1 && hasBlockSyntax) {
    return clipboardText;
  }

  return null;
}

function parseMarkdownClipboardText(text: string) {
  const { protectedText: mathProtectedText, mathTokens } = protectMathTokens(text);
  const { protectedText, tokens } = protectNoteTokens(mathProtectedText);
  const rendered = marked.parse(protectedText, {
    async: false,
    breaks: true,
    gfm: true,
  });

  if (typeof rendered !== "string") {
    return "";
  }

  return restoreMathTokens(restoreProtectedTokens(rendered, tokens, true), mathTokens);
}

const ReferenceDecorations = Extension.create({
  name: "referenceDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: referenceDecorationsKey,
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) {
                return;
              }

              for (const match of node.text.matchAll(/\[\[[^\]]+\]\]/g)) {
                if (match.index === undefined) continue;

                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: "note-ref-token note-ref-token-page",
                  })
                );
              }

              for (const match of node.text.matchAll(/(^|[\s(])#([a-z0-9][a-z0-9_/-]*)/gi)) {
                if (match.index === undefined) continue;

                const prefixLength = match[1]?.length ?? 0;
                const start = pos + match.index + prefixLength;
                const end = start + (match[2]?.length ?? 0) + 1;

                decorations.push(
                  Decoration.inline(start, end, {
                    class: "note-ref-token note-ref-token-tag",
                  })
                );
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

const MarkdownLink = Link.extend({
  addInputRules() {
    return [
      markInputRule({
        find: markdownLinkInputRegex,
        type: this.type,
        getAttributes: (match) => ({ href: match[2] }),
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: markdownLinkPasteRegex,
        type: this.type,
        getAttributes: (match) => ({ href: match[2] }),
      }),
    ];
  },
}).configure({
  autolink: true,
  linkOnPaste: true,
  openOnClick: false,
  HTMLAttributes: {
    rel: "noopener noreferrer nofollow",
    target: "_blank",
  },
});

const NotesHorizontalRule = HorizontalRule.extend({
  addInputRules() {
    return [];
  },
});

const NotesArrowReplacement = Extension.create({
  name: "notesArrowReplacement",

  addInputRules() {
    return [
      new InputRule({
        find: /-->$/,
        handler: ({ chain, range }) => {
          chain().insertContentAt(range, "→").run();
        },
      }),
      new InputRule({
        find: /<--$/,
        handler: ({ chain, range }) => {
          chain().insertContentAt(range, "←").run();
        },
      }),
    ];
  },
});

function isJsonContent(value: unknown): value is JSONContent {
  return Boolean(value) && typeof value === "object" && "type" in (value as Record<string, unknown>);
}

function parseDocument(raw: unknown): JSONContent {
  const normalized = normalizeNoteDocument(raw);

  if (isJsonContent(normalized)) {
    return normalized;
  }

  logger.warn("[notes] Normalized block content was not a valid document", {
    raw,
    normalized,
  });
  return emptyDocument();
}

function splitEditorDocumentAtSelection(editor: Editor) {
  const { from, to } = editor.state.selection;
  const currentContent = parseDocument(editor.state.doc.cut(0, from).toJSON());
  const nextSiblingContent = parseDocument(editor.state.doc.cut(to).toJSON());

  return {
    currentContent,
    nextSiblingContent,
  };
}

function createNormalTextSiblingContent(content: JSONContent) {
  const text = extractNoteText(content);
  return text.trim().length > 0 ? createNoteDocumentFromText(text) : emptyDocument();
}

function isAtStartOfBlockContent(editor: Editor) {
  const { from } = editor.state.selection;
  return editor.state.doc.textBetween(0, from, "\n", "\0").length === 0;
}

function createParagraphNode(text: string): JSONContent {
  return {
    type: "paragraph",
    content: text.length > 0 ? [{ type: "text", text }] : [],
  };
}

function getEditorPlainText(view: EditorView) {
  return view.state.doc.textBetween(0, view.state.doc.content.size, "\n").trim();
}

function getSelectionHtml(view: EditorView) {
  const fragment = view.state.selection.content().content;
  if (fragment.childCount === 0) {
    return "";
  }

  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const wrapper = document.createElement("div");
  wrapper.appendChild(serializer.serializeFragment(fragment));
  return wrapper.innerHTML;
}

function getSelectionMarkdown(view: EditorView) {
  const html = getSelectionHtml(view);
  if (!html) {
    return "";
  }

  return normalizeExportedMarkdownTokens(turndownService.turndown(html).trim());
}

function parseHtmlDocument(view: EditorView, html: string): JSONContent | null {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const documentNode = parser.parse(wrapper);
  return documentNode.toJSON() as JSONContent;
}

function splitMarkdownTableRow(line: string) {
  const normalized = line.trim().replace(/^\||\|$/g, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function createTableCellNode(type: "tableHeader" | "tableCell", text: string): JSONContent {
  return {
    type,
    content: [createParagraphNode(text)],
  };
}

function parseMarkdownTable(text: string): JSONContent | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return null;
  }

  const headerCells = splitMarkdownTableRow(lines[0]);
  const separatorCells = splitMarkdownTableRow(lines[1]);

  if (
    headerCells.length === 0 ||
    headerCells.length !== separatorCells.length ||
    !separatorCells.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    return null;
  }

  const bodyRows = lines.slice(2).map((line) => splitMarkdownTableRow(line));
  if (bodyRows.some((row) => row.length !== headerCells.length)) {
    return null;
  }

  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: headerCells.map((cell) => createTableCellNode("tableHeader", cell)),
          },
          ...bodyRows.map((row) => ({
            type: "tableRow",
            content: row.map((cell) => createTableCellNode("tableCell", cell)),
          })),
        ],
      },
    ],
  };
}

function parseMarkdownImage(text: string): JSONContent | null {
  const match = text.match(markdownImageBlockRegex);
  if (!match) {
    return null;
  }

  return {
    type: "doc",
    content: [
      {
        type: "image",
        attrs: {
          src: match[2],
          alt: match[1] || null,
          title: match[3] || null,
        },
      },
    ],
  };
}

function parseMarkdownTextDocument(view: EditorView, text: string): JSONContent {
  const trimmed = text.trim();
  if (!trimmed) {
    return emptyDocument();
  }

  const nextImageDocument = parseMarkdownImage(trimmed);
  if (nextImageDocument) {
    return nextImageDocument;
  }

  const nextTableDocument = parseMarkdownTable(trimmed);
  if (nextTableDocument) {
    return nextTableDocument;
  }

  const nextHtml = parseMarkdownClipboardText(text);
  return parseHtmlDocument(view, nextHtml) ?? createScaffoldDocument(text);
}

function tryConvertMarkdownBlock(editor: Editor) {
  const nextImageDocument = parseMarkdownImage(getEditorPlainText(editor.view));
  if (nextImageDocument) {
    editor.commands.setContent(nextImageDocument, { emitUpdate: true });
    return true;
  }

  const nextTableDocument = parseMarkdownTable(getEditorPlainText(editor.view));
  if (nextTableDocument) {
    editor.commands.setContent(nextTableDocument, { emitUpdate: true });
    return true;
  }

  return false;
}

function isHorizontalRuleOnlyDocument(value: JSONContent | null | undefined) {
  if (!value || value.type !== "doc" || !Array.isArray(value.content) || value.content.length !== 1) {
    return false;
  }

  return value.content[0]?.type === "horizontalRule";
}

type PageReferenceQuery = {
  query: string;
  from: number;
  to: number;
};

type ResolvedPageReference = {
  title: string;
  from: number;
  to: number;
};

function getPageReferenceQuery(editor: Editor): PageReferenceQuery | null {
  const { state } = editor;

  if (!state.selection.empty) {
    return null;
  }

  const { $from, from } = state.selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "", "\0");
  const triggerIndex = textBefore.lastIndexOf("[[");
  if (triggerIndex < 0) {
    return null;
  }

  const lastClosedIndex = textBefore.lastIndexOf("]]"
  );
  if (lastClosedIndex > triggerIndex) {
    return null;
  }

  const textAfter = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, "", "\0");
  const closingIndex = textAfter.indexOf("]]"
  );
  const suffix = closingIndex >= 0 ? textAfter.slice(0, closingIndex) : "";
  const prefix = textBefore.slice(triggerIndex + 2);
  const query = `${textBefore.slice(triggerIndex + 2)}${suffix}`;

  if (closingIndex === 0 && prefix.trim().length === 0) {
    return null;
  }

  if (query.includes("[[") || query.includes("]]")) {
    return null;
  }

  return {
    query,
    from: $from.start() + triggerIndex,
    to: closingIndex >= 0 ? from + closingIndex + 2 : from,
  };
}

function getResolvedPageReferenceAtPosition(editor: Editor, position: number): ResolvedPageReference | null {
  const boundedPosition = Math.max(0, Math.min(position, editor.state.doc.content.size));
  const resolvedPosition = editor.state.doc.resolve(boundedPosition);
  const parentText = resolvedPosition.parent.textBetween(0, resolvedPosition.parent.content.size, "", "\0");
  const parentOffset = resolvedPosition.parentOffset;

  for (const match of parentText.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (match.index === undefined) {
      continue;
    }

    const from = match.index;
    const to = from + match[0].length;
    if (parentOffset < from || parentOffset > to) {
      continue;
    }

    const title = (match[1] ?? "").trim();
    if (!title) {
      return null;
    }

    return {
      title,
      from,
      to,
    };
  }

  return null;
}

export const NoteBlockEditor = memo(function NoteBlockEditor({
  content,
  notePageTitles,
  hasChildren = false,
  markdownToggleVersion = 0,
  shouldFocus = false,
  focusPlacement = "end",
  onFocusApplied,
  onFocus,
  onChange,
  onCommit,
  onCreateSibling,
  onCreateSiblings,
  onMergeWithPrevious,
  onOpenPageReference,
  onEditorCreate,
  onNavigateUp,
  onNavigateDown,
  onSelectUp,
  onSelectDown,
  onMoveSelectionUp,
  onMoveSelectionDown,
  onIndent,
  onOutdent,
  onDeleteEmpty,
}: {
  content: string | null | undefined;
  notePageTitles: string[];
  hasChildren?: boolean;
  markdownToggleVersion?: number;
  shouldFocus?: boolean;
  focusPlacement?: number | "start" | "end";
  onFocusApplied?: () => void;
  onFocus?: () => void;
  onChange: (content: JSONContent) => void;
  onCommit?: (content: JSONContent) => void;
  onCreateSibling: (
    content: JSONContent,
    nextSiblingContent?: JSONContent,
    options?: {
      focusPlacement?: "start" | "end";
      focusTarget?: "created" | "current";
      insertionSide?: "before" | "after";
    }
  ) => void;
  onCreateSiblings?: (content: NoteBlockInsert, siblingContents: NoteBlockInsert[]) => Promise<void> | void;
  onMergeWithPrevious?: (content: JSONContent, options?: { hasChildren?: boolean }) => void | Promise<void>;
  onOpenPageReference?: (title: string) => void;
  onEditorCreate?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onSelectUp?: () => void;
  onSelectDown?: () => void;
  onMoveSelectionUp?: () => void;
  onMoveSelectionDown?: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDeleteEmpty: () => void;
}) {
  const initialContentRef = useRef(parseDocument(content));
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onCommitRef = useRef(onCommit);
  const onCreateSiblingRef = useRef(onCreateSibling);
  const onCreateSiblingsRef = useRef(onCreateSiblings);
  const onMergeWithPreviousRef = useRef(onMergeWithPrevious);
  const onOpenPageReferenceRef = useRef(onOpenPageReference);
  const onEditorCreateRef = useRef(onEditorCreate);
  const onNavigateUpRef = useRef(onNavigateUp);
  const onNavigateDownRef = useRef(onNavigateDown);
  const onSelectUpRef = useRef(onSelectUp);
  const onSelectDownRef = useRef(onSelectDown);
  const onMoveSelectionUpRef = useRef(onMoveSelectionUp);
  const onMoveSelectionDownRef = useRef(onMoveSelectionDown);
  const onIndentRef = useRef(onIndent);
  const onOutdentRef = useRef(onOutdent);
  const onDeleteEmptyRef = useRef(onDeleteEmpty);
  const lastAppliedExternalContentRef = useRef(JSON.stringify(initialContentRef.current));
  const pendingLocalContentRef = useRef<string | null>(null);
  const suppressBlurCommitRef = useRef(false);
  const isEditingMarkdownSourceRef = useRef(false);
  const lastMarkdownToggleVersionRef = useRef(markdownToggleVersion);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [pageReferenceQuery, setPageReferenceQuery] = useState<PageReferenceQuery | null>(null);
  const [selectedPageReferenceIndex, setSelectedPageReferenceIndex] = useState(0);
  const [tableToolbarState, setTableToolbarState] = useState<TableToolbarState>(hiddenTableToolbarState);
  const [tableToolbarPosition, setTableToolbarPosition] = useState<TableToolbarPosition | null>(null);
  const [isTableMenuOpen, setIsTableMenuOpen] = useState(false);
  const isTableMenuOpenRef = useRef(false);
  isTableMenuOpenRef.current = isTableMenuOpen;
  const editorShellRef = useRef<HTMLDivElement | null>(null);
  const tableMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tableMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const tableFocusedCellPosRef = useRef<number | null>(null);
  const slashQueryRef = useRef<string | null>(null);
  const filteredSlashCommandsRef = useRef<SlashCommand[]>([]);
  const slashItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pageReferenceQueryRef = useRef<PageReferenceQuery | null>(null);
  const filteredPageReferenceTitlesRef = useRef<string[]>([]);
  const pageReferenceItemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const filteredSlashCommands = useMemo(() => getFilteredSlashCommands(slashQuery), [slashQuery]);

  const groupedSlashCommands = useMemo(() => getGroupedSlashCommands(filteredSlashCommands), [filteredSlashCommands]);

  const filteredPageReferenceTitles = useMemo(() => {
    if (pageReferenceQuery === null) {
      return [];
    }

    const normalizedQuery = pageReferenceQuery.query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return notePageTitles;
    }

    return notePageTitles.filter((title) => title.toLocaleLowerCase().includes(normalizedQuery));
  }, [notePageTitles, pageReferenceQuery]);

  const emitEditorContentIfChanged = () => {
    if (!editor) return null;

    const nextContent = editor.getJSON();
    const nextSerialized = JSON.stringify(nextContent);
    const currentSerialized = JSON.stringify(editor.getJSON());
    const pendingLocalContent = pendingLocalContentRef.current;
    const baselineSerialized = pendingLocalContent ?? lastAppliedExternalContentRef.current;

    if (nextSerialized === baselineSerialized || nextSerialized === currentSerialized && pendingLocalContent === nextSerialized) {
      return null;
    }

    pendingLocalContentRef.current = nextSerialized;
    onChangeRef.current(nextContent);
    return nextContent;
  };

  const updateSlashQuery = (nextEditor: Editor) => {
    const nextQuery = getSlashQuery(nextEditor);
    setSlashQuery(nextQuery);
  };

  const updatePageReferenceQuery = (nextEditor: Editor) => {
    const nextQuery = getPageReferenceQuery(nextEditor);
    setPageReferenceQuery(nextQuery);
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (!editor) return;

    const nextContent = command.createContent();

    if (command.id === "horizontal-rule") {
      pendingLocalContentRef.current = JSON.stringify(nextContent);
      editor.commands.setContent(nextContent, { emitUpdate: true });
      setSlashQuery(null);
      setSelectedSlashIndex(0);
      onCreateSiblingRef.current(nextContent, emptyDocument(), {
        focusPlacement: "start",
        focusTarget: "created",
        insertionSide: "after",
      });
      return;
    }

    pendingLocalContentRef.current = JSON.stringify(nextContent);
    editor.commands.setContent(nextContent, { emitUpdate: true });
    setSlashQuery(null);
    setSelectedSlashIndex(0);

    requestAnimationFrame(() => {
      editor.chain().focus("end").run();
    });
  };

  const applyPageReference = (title: string) => {
    if (!editor) return;

    const nextQuery = pageReferenceQueryRef.current;
    if (!nextQuery) return;

    const nextReference = `[[${title}]]`;

    editor.chain().focus().command(({ tr, dispatch }) => {
      tr.insertText(nextReference, nextQuery.from, nextQuery.to);
      tr.setSelection(TextSelection.create(tr.doc, nextQuery.from + nextReference.length));

      if (dispatch) {
        dispatch(tr.scrollIntoView());
      }

      return true;
    }).run();

    setPageReferenceQuery(null);
    setSelectedPageReferenceIndex(0);
  };

  const convertCurrentBlockToMarkdownSource = () => {
    if (!editor) return null;

    const markdown = serializeNoteDocumentToMarkdown(editor.getJSON());
    const nextContent = createNoteDocumentFromText(markdown);
    isEditingMarkdownSourceRef.current = true;
    pendingLocalContentRef.current = JSON.stringify(nextContent);
    editor.commands.setContent(nextContent, { emitUpdate: true });

    requestAnimationFrame(() => {
      editor.chain().focus("end").run();
    });

    return nextContent;
  };

  const renderCurrentMarkdownSource = () => {
    if (!editor) return null;

    const markdownText = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n");
    const nextContent = parseMarkdownTextDocument(editor.view, markdownText);
    isEditingMarkdownSourceRef.current = false;
    pendingLocalContentRef.current = JSON.stringify(nextContent);
    editor.commands.setContent(nextContent, { emitUpdate: true });
    return nextContent;
  };

  const flushEditorContent = () => {
    if (!editor) return null;

    const nextContent = editor.getJSON();
    const nextSerialized = JSON.stringify(nextContent);
    const pendingLocalContent = pendingLocalContentRef.current;

    if (nextSerialized === (pendingLocalContent ?? lastAppliedExternalContentRef.current)) {
      return nextContent;
    }

    pendingLocalContentRef.current = nextSerialized;
    onChangeRef.current(nextContent);
    return nextContent;
  };

  useEffect(() => {
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    onCommitRef.current = onCommit;
    onCreateSiblingRef.current = onCreateSibling;
    onCreateSiblingsRef.current = onCreateSiblings;
    onMergeWithPreviousRef.current = onMergeWithPrevious;
    onOpenPageReferenceRef.current = onOpenPageReference;
    onEditorCreateRef.current = onEditorCreate;
    onNavigateUpRef.current = onNavigateUp;
    onNavigateDownRef.current = onNavigateDown;
    onSelectUpRef.current = onSelectUp;
    onSelectDownRef.current = onSelectDown;
    onMoveSelectionUpRef.current = onMoveSelectionUp;
    onMoveSelectionDownRef.current = onMoveSelectionDown;
    onIndentRef.current = onIndent;
    onOutdentRef.current = onOutdent;
    onDeleteEmptyRef.current = onDeleteEmpty;
  }, [onChange, onCommit, onCreateSibling, onCreateSiblings, onDeleteEmpty, onFocus, onIndent, onMergeWithPrevious, onMoveSelectionDown, onMoveSelectionUp, onNavigateDown, onNavigateUp, onOpenPageReference, onOutdent, onSelectDown, onSelectUp]);

  useEffect(() => {
    slashQueryRef.current = slashQuery;
    filteredSlashCommandsRef.current = filteredSlashCommands;
    pageReferenceQueryRef.current = pageReferenceQuery;
    filteredPageReferenceTitlesRef.current = filteredPageReferenceTitles;
  }, [filteredPageReferenceTitles, filteredSlashCommands, pageReferenceQuery, slashQuery]);

  useEffect(() => {
    setSelectedSlashIndex((currentIndex) => {
      if (filteredSlashCommands.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, filteredSlashCommands.length - 1);
    });
  }, [filteredSlashCommands.length]);

  useEffect(() => {
    setSelectedPageReferenceIndex((currentIndex) => {
      if (filteredPageReferenceTitles.length === 0) {
        return 0;
      }

      return Math.min(currentIndex, filteredPageReferenceTitles.length - 1);
    });
  }, [filteredPageReferenceTitles.length]);

  useEffect(() => {
    if (slashQuery === null) {
      slashItemRefs.current = [];
      return;
    }

    const nextItem = slashItemRefs.current[selectedSlashIndex];
    nextItem?.scrollIntoView({ block: "nearest" });
  }, [selectedSlashIndex, slashQuery]);

  useEffect(() => {
    if (pageReferenceQuery === null) {
      pageReferenceItemRefs.current = [];
      return;
    }

    const nextItem = pageReferenceItemRefs.current[selectedPageReferenceIndex];
    nextItem?.scrollIntoView({ block: "nearest" });
  }, [pageReferenceQuery, selectedPageReferenceIndex]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Strike,
      Code,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      Blockquote,
      Heading.configure({
        levels: [1, 2, 3, 4, 5],
      }),
      NotesArrowReplacement,
      NotesHorizontalRule,
      MarkdownLink,
      Image,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.extend({
        renderHTML({ HTMLAttributes }) {
          return ["table", HTMLAttributes, ["tbody", 0]];
        },
      }).configure({
        resizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
      HardBreak,
      History,
      Dropcursor,
      Gapcursor,
      ReferenceDecorations,
      MathInline,
      MathBlock,
    ],
    content: initialContentRef.current,
    editorProps: {
      attributes: {
        class:
          "min-h-6 rounded-none border-0 bg-transparent px-0 py-0 text-sm leading-5 text-foreground outline-none focus:outline-none cursor-text",
      },
      handleDOMEvents: {
        focus() {
          onFocusRef.current?.();
          return false;
        },
        click(view, event) {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.closest(".note-ref-token-page")) {
            return false;
          }

          const nextEditor = editor ?? view as unknown as Editor;
          const position = view.posAtDOM(target, 0);
          const reference = getResolvedPageReferenceAtPosition(nextEditor, position);
          if (!reference) {
            return false;
          }

          const canOpenReference = notePageTitles.some((title) => title.localeCompare(reference.title, undefined, { sensitivity: "accent" }) === 0);
          if (!canOpenReference) {
            return false;
          }

          event.preventDefault();
          onOpenPageReferenceRef.current?.(reference.title);
          return true;
        },
        blur() {
          if (suppressBlurCommitRef.current) {
            suppressBlurCommitRef.current = false;
            emitEditorContentIfChanged();
            return false;
          }

          if (isEditingMarkdownSourceRef.current) {
            const nextContent = renderCurrentMarkdownSource();
            if (nextContent) {
              onCommitRef.current?.(nextContent);
            }
            return false;
          }

          const nextContent = emitEditorContentIfChanged();
          if (nextContent) {
            onCommitRef.current?.(nextContent);
          }

          return false;
        },
        copy(view, event) {
          const clipboardEvent = event as ClipboardEvent;
          if (!clipboardEvent.clipboardData || view.state.selection.empty) {
            return false;
          }

          const markdown = getSelectionMarkdown(view);
          if (!markdown) {
            return false;
          }

          clipboardEvent.preventDefault();
          clipboardEvent.clipboardData.setData("text/plain", markdown);
          clipboardEvent.clipboardData.setData("text/markdown", markdown);
          clipboardEvent.clipboardData.setData("text/html", getSelectionHtml(view));
          return true;
        },
        cut(view, event) {
          const clipboardEvent = event as ClipboardEvent;
          if (!clipboardEvent.clipboardData || view.state.selection.empty) {
            return false;
          }

          const markdown = getSelectionMarkdown(view);
          if (!markdown) {
            return false;
          }

          clipboardEvent.preventDefault();
          clipboardEvent.clipboardData.setData("text/plain", markdown);
          clipboardEvent.clipboardData.setData("text/markdown", markdown);
          clipboardEvent.clipboardData.setData("text/html", getSelectionHtml(view));
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
          return true;
        },
      },
      handlePaste(view, event) {
        const blockClipboardData = event.clipboardData?.getData(NOTES_BLOCK_CLIPBOARD_MIME) ?? "";
        const pastedBlocks = parseBlockClipboardData(blockClipboardData);

        if (pastedBlocks && pastedBlocks.length > 0) {
          const [nextContent, ...nextSiblingContents] = pastedBlocks;

          event.preventDefault();
          pendingLocalContentRef.current = JSON.stringify(nextContent.content);
          editor?.commands.setContent(nextContent.content as JSONContent, { emitUpdate: true });
          void onCreateSiblingsRef.current?.(nextContent, nextSiblingContents);
          updateSlashQuery(editor ?? view as unknown as Editor);
          updatePageReferenceQuery(editor ?? view as unknown as Editor);
          return true;
        }

        const markdownClipboardText = getMarkdownClipboardText(event);

        if (!markdownClipboardText) {
          return false;
        }

        const nextDocuments = parseClipboardMarkdown(markdownClipboardText, {
          renderMarkdown: parseMarkdownClipboardText,
          parseHtmlDocument: (html) => parseHtmlDocument(view, html),
          createScaffoldDocument,
        });
        if (nextDocuments.length === 0) {
          return false;
        }

        if (shouldReplaceOnMarkdownPaste(nextDocuments)) {
          const [nextContent, ...nextSiblingContents] = nextDocuments;

          event.preventDefault();
          pendingLocalContentRef.current = JSON.stringify(nextContent.content);
          editor?.commands.setContent(nextContent.content as JSONContent, { emitUpdate: true });
          void onCreateSiblingsRef.current?.(nextContent, nextSiblingContents);
          updateSlashQuery(editor ?? view as unknown as Editor);
          updatePageReferenceQuery(editor ?? view as unknown as Editor);
          return true;
        }

        const nextHtml = parseMarkdownClipboardText(markdownClipboardText);
        if (!nextHtml) {
          return false;
        }

        event.preventDefault();
        editor?.commands.insertContent(nextHtml, {
          parseOptions: {
            preserveWhitespace: false,
          },
        });
        updateSlashQuery(editor ?? view as unknown as Editor);
        updatePageReferenceQuery(editor ?? view as unknown as Editor);
        return true;
      },
      handleKeyDown(view: EditorView, event: KeyboardEvent) {
        if (event.shiftKey && event.key === "ArrowUp" && onSelectUpRef.current) {
          event.preventDefault();
          suppressBlurCommitRef.current = true;

          if (isEditingMarkdownSourceRef.current) {
            const nextContent = renderCurrentMarkdownSource();
            if (nextContent) {
              onCommitRef.current?.(nextContent);
            }
          } else {
            emitEditorContentIfChanged();
          }

          onSelectUpRef.current();
          return true;
        }

        if (event.shiftKey && event.key === "ArrowDown" && onSelectDownRef.current) {
          event.preventDefault();
          suppressBlurCommitRef.current = true;

          if (isEditingMarkdownSourceRef.current) {
            const nextContent = renderCurrentMarkdownSource();
            if (nextContent) {
              onCommitRef.current?.(nextContent);
            }
          } else {
            emitEditorContentIfChanged();
          }

          onSelectDownRef.current();
          return true;
        }

        const arrowMoveAction = getBlockArrowMoveAction({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          key: event.key,
          canMoveSelectionUp: Boolean(onMoveSelectionUpRef.current),
          canMoveSelectionDown: Boolean(onMoveSelectionDownRef.current),
        });

        if (arrowMoveAction !== "none") {
          event.preventDefault();
          suppressBlurCommitRef.current = true;

          if (isEditingMarkdownSourceRef.current) {
            const nextContent = renderCurrentMarkdownSource();
            if (nextContent) {
              onCommitRef.current?.(nextContent);
            }
          } else {
            emitEditorContentIfChanged();
          }

          if (arrowMoveAction === "move-selection-up") {
            onMoveSelectionUpRef.current?.();
          } else {
            onMoveSelectionDownRef.current?.();
          }

          return true;
        }

        if (pageReferenceQueryRef.current !== null) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            view.focus();
            setSelectedPageReferenceIndex((currentIndex) => {
              const titles = filteredPageReferenceTitlesRef.current;
              if (titles.length === 0) {
                return 0;
              }

              return (currentIndex + 1) % titles.length;
            });
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            view.focus();
            setSelectedPageReferenceIndex((currentIndex) => {
              const titles = filteredPageReferenceTitlesRef.current;
              if (titles.length === 0) {
                return 0;
              }

              return (currentIndex - 1 + titles.length) % titles.length;
            });
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setPageReferenceQuery(null);
            setSelectedPageReferenceIndex(0);
            return true;
          }

          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const nextTitle = filteredPageReferenceTitlesRef.current[selectedPageReferenceIndex] ?? null;
            if (nextTitle) {
              event.preventDefault();
              applyPageReference(nextTitle);
              return true;
            }
          }
        }

        if (slashQueryRef.current !== null) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            view.focus();
            setSelectedSlashIndex((currentIndex) => {
              const commands = filteredSlashCommandsRef.current;
              if (commands.length === 0) {
                return 0;
              }

              return (currentIndex + 1) % commands.length;
            });
            return true;
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            view.focus();
            setSelectedSlashIndex((currentIndex) => {
              const commands = filteredSlashCommandsRef.current;
              if (commands.length === 0) {
                return 0;
              }

              return (currentIndex - 1 + commands.length) % commands.length;
            });
            return true;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setSlashQuery(null);
            setSelectedSlashIndex(0);
            return true;
          }

          if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
            const nextCommand = filteredSlashCommandsRef.current[selectedSlashIndex] ?? null;
            if (nextCommand) {
              event.preventDefault();
              applySlashCommand(nextCommand);
              return true;
            }
          }
        }

        const isEmptyBlock = view.state.doc.textContent.trim().length === 0;

        const enterAction = getBlockEnterAction({
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          isTaskItem: Boolean(editor?.isActive("taskItem")),
          isCodeBlock: Boolean(editor?.isActive("codeBlock")),
          isTable: Boolean(editor?.isActive("table")),
          isHorizontalRuleOnly: Boolean(editor && isHorizontalRuleOnlyDocument(editor.getJSON())),
          isEmptyBlock,
          hasChildren,
        });

        if (enterAction === "create-code-or-table-sibling") {
          if (editor) {
            event.preventDefault();
            const nextContent = flushEditorContent() ?? editor.getJSON();
            onCreateSiblingRef.current(nextContent);
            return true;
          }
        }

        if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          if (enterAction === "exit-empty-task") {
            event.preventDefault();
            const nextContent = emptyDocument();
            pendingLocalContentRef.current = JSON.stringify(nextContent);
            editor?.commands.setContent(nextContent, { emitUpdate: true });
            onCommitRef.current?.(nextContent);
            return true;
          }

          if (enterAction === "create-task-sibling") {
            event.preventDefault();
            const nextContent = flushEditorContent();
            if (nextContent) {
              onCreateSiblingRef.current(nextContent, emptyTaskListDocument());
            }
            return true;
          }

          if (enterAction === "create-horizontal-rule-sibling" && editor) {
            event.preventDefault();
            const nextContent = editor.getJSON();
            onCreateSiblingRef.current(nextContent, emptyDocument(), {
              focusPlacement: "start",
              focusTarget: "created",
              insertionSide: "after",
            });
            return true;
          }

          if (enterAction === "none" && (editor?.isActive("codeBlock") || editor?.isActive("table"))) {
            return false;
          }

          if (editor && tryConvertMarkdownBlock(editor)) {
            return true;
          }

          event.preventDefault();
          if (editor) {
            const { currentContent, nextSiblingContent } = splitEditorDocumentAtSelection(editor);
            const isAtBlockStart = isAtStartOfBlockContent(editor);
            const splitOptions = getSplitSiblingOptions({ hasChildren, isAtBlockStart });

            if (hasChildren) {
              pendingLocalContentRef.current = JSON.stringify(nextSiblingContent);
              editor.commands.setContent(nextSiblingContent, { emitUpdate: true });
              onCreateSiblingRef.current(nextSiblingContent, createNormalTextSiblingContent(currentContent), splitOptions);
            } else {
              pendingLocalContentRef.current = JSON.stringify(currentContent);
              editor.commands.setContent(currentContent, { emitUpdate: true });
              onCreateSiblingRef.current(currentContent, createNormalTextSiblingContent(nextSiblingContent), splitOptions);
            }
          }
          return true;
        }

        if (event.key === "Tab") {
          const tabAction = getBlockTabAction({
            shiftKey: event.shiftKey,
            isCodeBlock: Boolean(editor?.isActive("codeBlock")),
            isTable: Boolean(editor?.isActive("table")),
            isAtBlockStart: view.state.selection.empty && view.state.selection.$from.parentOffset === 0,
          });

          if (tabAction === "none") {
            return false;
          }

          event.preventDefault();
          if (tabAction === "indent") {
            onIndentRef.current();
            return true;
          }

          if (tabAction === "outdent") {
            onOutdentRef.current();
            return true;
          }

          editor?.commands.insertContent("\t");
          return true;
        }

        if (event.key === "ArrowUp" && shouldNavigateBetweenBlocks({
          selectionEmpty: view.state.selection.empty,
          atTextBoundary: view.endOfTextblock("up"),
          hasAdjacentBlock: Boolean(onNavigateUpRef.current),
        })) {
          if (onNavigateUpRef.current) {
            event.preventDefault();
            suppressBlurCommitRef.current = true;

            if (isEditingMarkdownSourceRef.current) {
              const nextContent = renderCurrentMarkdownSource();
              if (nextContent) {
                onCommitRef.current?.(nextContent);
              }
            } else {
              emitEditorContentIfChanged();
            }

            onNavigateUpRef.current();
            return true;
          }
        }

        if (event.key === "ArrowDown" && shouldNavigateBetweenBlocks({
          selectionEmpty: view.state.selection.empty,
          atTextBoundary: view.endOfTextblock("down"),
          hasAdjacentBlock: Boolean(onNavigateDownRef.current),
        })) {
          if (onNavigateDownRef.current) {
            event.preventDefault();
            suppressBlurCommitRef.current = true;

            if (isEditingMarkdownSourceRef.current) {
              const nextContent = renderCurrentMarkdownSource();
              if (nextContent) {
                onCommitRef.current?.(nextContent);
              }
            } else {
              emitEditorContentIfChanged();
            }

            onNavigateDownRef.current();
            return true;
          }
        }

        const backspaceAction = getBlockBackspaceAction({
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          selectionEmpty: view.state.selection.empty,
          isEmptyBlock,
          isTaskItem: Boolean(editor?.isActive("taskItem")),
          isCodeBlock: Boolean(editor?.isActive("codeBlock")),
          isTable: Boolean(editor?.isActive("table")),
          isHeading: Boolean(editor?.isActive("heading")),
          isBlockquote: Boolean(editor?.isActive("blockquote")),
          isHorizontalRuleOnly: Boolean(editor && isHorizontalRuleOnlyDocument(editor.getJSON())),
          isAtBlockStart: Boolean(editor && isAtStartOfBlockContent(editor)),
          canMergeWithPrevious: Boolean(onMergeWithPreviousRef.current),
        });

        if (event.key === "Backspace" && (backspaceAction === "reset-empty-block" || backspaceAction === "delete-empty-block")) {
          event.preventDefault();

          if (backspaceAction === "delete-empty-block") {
            flushEditorContent();
            onDeleteEmptyRef.current();
            return true;
          }

          const nextContent = emptyDocument();
          pendingLocalContentRef.current = JSON.stringify(nextContent);
          editor?.commands.setContent(nextContent, { emitUpdate: true });
          onCommitRef.current?.(nextContent);
          return true;
        }

        const mergeWithPrevious = onMergeWithPreviousRef.current;

        if (event.key === "Backspace" && backspaceAction === "merge-with-previous" && editor && mergeWithPrevious) {
          event.preventDefault();
          const rawContent = flushEditorContent() ?? editor?.getJSON();
          if (rawContent) {
            const nextContent = (editor.isActive("heading") || editor.isActive("blockquote"))
              ? createNormalTextSiblingContent(rawContent)
              : rawContent;
            suppressBlurCommitRef.current = true;
            void mergeWithPrevious(nextContent, { hasChildren });
            return true;
          }
        }

        return false;
      },
    },
    onUpdate({ editor: nextEditor }: { editor: Editor }) {
      const nextContent = nextEditor.getJSON();
      pendingLocalContentRef.current = JSON.stringify(nextContent);
      onChangeRef.current(nextContent);
      updateSlashQuery(nextEditor);
      updatePageReferenceQuery(nextEditor);
    },
    onCreate() {
      onEditorCreateRef.current?.();
    },
  }, []);

  useEffect(() => {
    if (!editor) return;

    const nextContent = parseDocument(content);
    const nextSerialized = JSON.stringify(nextContent);
    const currentSerialized = JSON.stringify(editor.getJSON());
    const pendingLocalContent = pendingLocalContentRef.current;
    const hasFocus = editor.isFocused;

    if (pendingLocalContent) {
      if (nextSerialized === pendingLocalContent) {
        lastAppliedExternalContentRef.current = nextSerialized;
        pendingLocalContentRef.current = null;
        return;
      }

      if (hasFocus) {
        return;
      }
    }

    if (nextSerialized === currentSerialized || nextSerialized === lastAppliedExternalContentRef.current) {
      lastAppliedExternalContentRef.current = nextSerialized;
      return;
    }

    lastAppliedExternalContentRef.current = nextSerialized;
    pendingLocalContentRef.current = null;
    isEditingMarkdownSourceRef.current = false;
    editor.commands.setContent(nextContent, { emitUpdate: false });
    updateSlashQuery(editor);
    updatePageReferenceQuery(editor);
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    if (markdownToggleVersion === lastMarkdownToggleVersionRef.current) return;

    lastMarkdownToggleVersionRef.current = markdownToggleVersion;

    if (isEditingMarkdownSourceRef.current) {
      const nextContent = renderCurrentMarkdownSource();
      if (nextContent) {
        onCommitRef.current?.(nextContent);
      }
      return;
    }

    convertCurrentBlockToMarkdownSource();
  }, [editor, markdownToggleVersion]);

  useEffect(() => {
    if (!editor || !shouldFocus) return;

    if (typeof focusPlacement === "number") {
      editor.chain().focus().setTextSelection(focusPlacement).run();
    } else {
      editor.chain().focus(focusPlacement).run();
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      onFocusApplied?.();
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [editor, focusPlacement, onFocusApplied, shouldFocus]);

  useEffect(() => {
    if (!editor) {
      setTableToolbarState(hiddenTableToolbarState);
      setTableToolbarPosition(null);
      setIsTableMenuOpen(false);
      return;
    }

    const updateTableToolbarState = () => {
      if (editor.isFocused && editor.isActive("table")) {
        tableFocusedCellPosRef.current = getFocusedTableCellPos(editor);
      }

      setTableToolbarState(getTableToolbarState(editor));

      // Don't move the toolbar while the menu is open — keeps it pinned
      // to the row where it was triggered.
      if (isTableMenuOpenRef.current) {
        return;
      }

      const nextToolbarPosition = getTableToolbarPosition(editor, editorShellRef.current);
      if (nextToolbarPosition) {
        setTableToolbarPosition(nextToolbarPosition);
      }
    };

    updateTableToolbarState();
    editor.on("transaction", updateTableToolbarState);
    editor.on("focus", updateTableToolbarState);
    editor.on("blur", updateTableToolbarState);

    return () => {
      editor.off("transaction", updateTableToolbarState);
      editor.off("focus", updateTableToolbarState);
      editor.off("blur", updateTableToolbarState);
    };
  }, [editor]);

  useEffect(() => {
    if (!isTableMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (tableMenuTriggerRef.current?.contains(target) || tableMenuPanelRef.current?.contains(target)) {
        return;
      }

      setIsTableMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      setIsTableMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTableMenuOpen]);

  if (!editor) {
    return (
      <div aria-hidden="true" className="min-h-6 px-0 py-0 text-sm leading-5 text-transparent">
        &nbsp;
      </div>
    );
  }

  return (
    <div
      ref={editorShellRef}
      className="group/note-editor relative cursor-text"
      onMouseDown={(event) => {
        if (!editor) return;
        if (event.target instanceof HTMLElement && event.target.closest(".ProseMirror")) return;
        event.preventDefault();
        editor.chain().focus("end").run();
      }}
    >
      {tableToolbarPosition !== null && (tableToolbarState.visible || isTableMenuOpen) ? (
        <div
          className={`absolute z-10 -translate-y-1/2 transition-opacity duration-150 ${isTableMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0 group-focus-within/note-editor:pointer-events-auto group-focus-within/note-editor:opacity-100 md:group-hover/note-editor:pointer-events-auto md:group-hover/note-editor:opacity-100"}`}
          style={{
            top: `${tableToolbarPosition.top}px`,
            right: `${tableToolbarPosition.right}px`,
          }}
        >
          <div className="relative">
            <button
              ref={tableMenuTriggerRef}
              type="button"
              title="Table options"
              aria-label="Table options"
              className="inline-flex size-7 items-center justify-center rounded-md border border-border/50 bg-card/95 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              onMouseDown={(event) => {
                tableFocusedCellPosRef.current = getFocusedTableCellPos(editor);
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsTableMenuOpen((open) => !open);
              }}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            {isTableMenuOpen ? (
              <div
                ref={tableMenuPanelRef}
                data-slot="dropdown-menu-content"
                className="absolute top-[calc(100%+0.375rem)] right-0 z-20 w-44 min-w-32 overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <button
                  type="button"
                  data-slot="dropdown-menu-item"
                  disabled={!tableToolbarState.canAddColumn}
                  className="group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => {
                    runTableActionAtFocusedCell(editor, tableFocusedCellPosRef.current, () => editor.commands.addColumnAfter());
                    setIsTableMenuOpen(false);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add column
                </button>
                <button
                  type="button"
                  data-slot="dropdown-menu-item"
                  disabled={!tableToolbarState.canDeleteColumn}
                  className="group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => {
                    runTableActionAtFocusedCell(editor, tableFocusedCellPosRef.current, () => editor.commands.deleteColumn());
                    setIsTableMenuOpen(false);
                  }}
                >
                  <Minus className="h-3.5 w-3.5" />
                  Delete column
                </button>
                <div className="my-1 h-px bg-border/70" />
                <button
                  type="button"
                  data-slot="dropdown-menu-item"
                  disabled={!tableToolbarState.canAddRow}
                  className="group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => {
                    runTableActionAtFocusedCell(editor, tableFocusedCellPosRef.current, () => editor.commands.addRowAfter());
                    setIsTableMenuOpen(false);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add row
                </button>
                <button
                  type="button"
                  data-slot="dropdown-menu-item"
                  disabled={!tableToolbarState.canDeleteRow}
                  className="group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => {
                    runTableActionAtFocusedCell(editor, tableFocusedCellPosRef.current, () => editor.commands.deleteRow());
                    setIsTableMenuOpen(false);
                  }}
                >
                  <Minus className="h-3.5 w-3.5" />
                  Delete row
                </button>
                <div className="my-1 h-px bg-border/70" />
                <button
                  type="button"
                  data-slot="dropdown-menu-item"
                  disabled={!tableToolbarState.canDeleteTable}
                  className="group/dropdown-menu-item relative flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-destructive outline-hidden select-none focus:bg-destructive/10 focus:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                  onClick={() => {
                    runTableActionAtFocusedCell(editor, tableFocusedCellPosRef.current, () => editor.commands.deleteTable());
                    setIsTableMenuOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete table
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      {pageReferenceQuery !== null ? (
        <div className="mt-2 max-w-md rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-lg backdrop-blur-sm">
          <Command shouldFilter={false} className="rounded-xl! bg-transparent p-0">
            <CommandList className="max-h-64">
              <CommandEmpty>No pages found.</CommandEmpty>
              <CommandGroup
                heading={
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Link2 className="h-3 w-3" />
                    Pages
                  </span>
                }
              >
                {filteredPageReferenceTitles.map((title, index) => (
                  <CommandItem
                    key={title}
                    value={title}
                    ref={(element) => {
                      pageReferenceItemRefs.current[index] = element;
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onSelect={() => applyPageReference(title)}
                    className={index === selectedPageReferenceIndex ? "bg-muted/80 text-foreground" : "text-foreground/95"}
                  >
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1 truncate text-[13px] leading-5">
                      <span className="font-medium text-foreground">{title}</span>
                    </div>
                    <CommandShortcut className="text-[10px] tracking-[0.12em]">[[</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      ) : slashQuery !== null ? (
        <div className="mt-2 max-w-md rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-lg backdrop-blur-sm">
          <Command shouldFilter={false} className="rounded-xl! bg-transparent p-0">
            <CommandList className="max-h-64">
              <CommandEmpty>No block types found.</CommandEmpty>
              {(() => {
                let flatIndex = -1;

                return groupedSlashCommands.map((section) => {
                  const SectionIcon = section.icon;

                  return (
                    <CommandGroup
                      key={section.id}
                      heading={
                        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          <SectionIcon className="h-3 w-3" />
                          {section.title}
                        </span>
                      }
                    >
                      {section.commands.map((command) => {
                        flatIndex += 1;
                        const Icon = command.icon;
                        const itemIndex = flatIndex;

                        return (
                          <CommandItem
                            key={command.id}
                            value={command.id}
                            ref={(element) => {
                              slashItemRefs.current[itemIndex] = element;
                            }}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onSelect={() => applySlashCommand(command)}
                            className={itemIndex === selectedSlashIndex ? "bg-muted/80 text-foreground" : "text-foreground/95"}
                          >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="min-w-0 flex-1 truncate text-[13px] leading-5">
                              <span className="font-medium text-foreground">{command.title}</span>
                              <span className="mx-1.5 text-muted-foreground/60">-</span>
                              <span className="text-[11px] text-muted-foreground">{command.description}</span>
                            </div>
                            <CommandShortcut className="text-[10px] tracking-[0.12em]">{command.shortcut}</CommandShortcut>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                });
              })()}
            </CommandList>
          </Command>
        </div>
      ) : null}
    </div>
  );
});
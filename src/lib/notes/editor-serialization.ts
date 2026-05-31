import type { JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { DOMParser as ProseMirrorDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

import { protectMathTokens, restoreMathTokens } from "@/lib/notes/math-clipboard";
import { protectNoteTokens, restoreProtectedTokens, normalizeExportedMarkdownTokens } from "@/lib/notes/editor-token-protection";
import { createNoteDocumentFromText, normalizeNoteDocument } from "@/lib/notes/notes-content";
import { createScaffoldDocument, emptyDocument } from "@/components/notes/NoteBlockEditorSlash";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const markdownBlockHintRegex = /(^|\n)\s*(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~|\|.+\||!\[[^\]]*\]\(|\[[^\]]+\]\([^\)]+\)|-{3,}|\*\*[^*]+\*\*|_[^_]+_)/;
const markdownLinkOrImageRegex = /!\[[^\]]*\]\([^\)]+\)|\[[^\]]+\]\([^\)]+\)/;
const markdownTableSeparatorRegex = /(^|\n)\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*($|\n)/;
const markdownTaskListRegex = /(^|\n)\s*[-*+]\s\[[ xX]\]\s/;
const markdownMathRegex = /\$\$[^\$]+\$\$|\$[^\$\s][^\$]*?\$/;
const markdownImageBlockRegex = /^!\[([^\]]*)\]\((\S+?)(?:\s+"([^"]+)")?\)$/;

// ---------------------------------------------------------------------------
// Turndown service
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function createParagraphNode(text: string): JSONContent {
  return {
    type: "paragraph",
    content: text.length > 0 ? [{ type: "text", text }] : [],
  };
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

// ---------------------------------------------------------------------------
// Clipboard text detection
// ---------------------------------------------------------------------------

export function getMarkdownClipboardText(event: ClipboardEvent) {
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

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

export function parseMarkdownClipboardText(text: string) {
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

// ---------------------------------------------------------------------------
// Table / Image parsing
// ---------------------------------------------------------------------------

export function parseMarkdownTable(text: string): JSONContent | null {
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

export function parseMarkdownImage(text: string): JSONContent | null {
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

// ---------------------------------------------------------------------------
// Selection serialization
// ---------------------------------------------------------------------------

export function getSelectionHtml(view: EditorView) {
  const fragment = view.state.selection.content().content;
  if (fragment.childCount === 0) {
    return "";
  }

  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const wrapper = document.createElement("div");
  wrapper.appendChild(serializer.serializeFragment(fragment));
  return wrapper.innerHTML;
}

export function getSelectionMarkdown(view: EditorView) {
  const html = getSelectionHtml(view);
  if (!html) {
    return "";
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  wrapper.querySelectorAll("span[data-math-inline]").forEach((el) => {
    const latex = el.getAttribute("data-latex") ?? "";
    el.replaceWith(`$${latex}$`);
  });
  wrapper.querySelectorAll("div[data-math-block]").forEach((el) => {
    const latex = el.getAttribute("data-latex") ?? "";
    el.replaceWith(`$$${latex}$$`);
  });

  return normalizeExportedMarkdownTokens(turndownService.turndown(wrapper.innerHTML).trim());
}

// ---------------------------------------------------------------------------
// Document parsing from markdown
// ---------------------------------------------------------------------------

export function parseHtmlDocument(view: EditorView, html: string): JSONContent | null {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const documentNode = parser.parse(wrapper);
  return documentNode.toJSON() as JSONContent;
}

export function parseMarkdownTextDocument(view: EditorView, text: string): JSONContent {
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

export function getEditorPlainText(view: EditorView) {
  return view.state.doc.textBetween(0, view.state.doc.content.size, "\n").trim();
}

export function tryConvertMarkdownBlock(editor: { view: EditorView; commands: { setContent: (content: JSONContent, options?: { emitUpdate?: boolean }) => boolean } }) {
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

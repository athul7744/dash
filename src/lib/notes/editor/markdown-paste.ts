/**
 * Markdown-text → block-node conversion for paste.
 *
 * The single-document editor's paste is native, which handles rich HTML well
 * but leaves raw markdown *text* (`## Heading`, `- item`, `- [ ] task`, `>`,
 * fences, tables, `**bold**`) as literal characters. This module parses that
 * text into the editor's `block` node shape so a paste lands as real structure.
 *
 * The editor schema has NO bullet/ordered-list node — nesting is just indented
 * `block`s and the only list-like node is consecutive `taskLine` checkbox
 * blocks. So markdown lists map onto:
 *   - bullet item  → nested plain paragraph block
 *   - ordered item → nested plain paragraph block, number kept as literal text
 *   - task item    → `taskLine` block (`checked` attr, blockType "task")
 *   - nested lists → nested child blocks
 *
 * Output blocks always carry `blockId: null`; `BlockIdPlugin` stamps ids on
 * insert and `BlockNormalize` guarantees the one-content-node-per-block shape.
 */

import type { JSONContent } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import type {
  Blockquote,
  Code,
  Heading,
  Image,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from "mdast";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE, TASK_BLOCK_TYPE } from "@/lib/notes/editor/block-document";

const MAX_HEADING_LEVEL = 5; // schema offers levels 1..5; h6 clamps to 5.

/** Parse markdown text into an array of `block` node JSON (may be empty). */
export function markdownToBlockNodes(text: string): JSONContent[] {
  const tree = fromMarkdown(text, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  return blocksFromNodes(tree.children);
}

/**
 * Insert parsed markdown blocks at the current selection. A lone plain
 * paragraph is inserted as inline content (merges into the current line);
 * anything block-level is inserted as a closed slice of `block` nodes, which
 * splits at the cursor. `BlockNormalize` + `BlockIdPlugin` finalize shape/ids.
 * Returns false (paste unhandled) when there's nothing to insert or a node
 * fails schema validation.
 */
export function insertMarkdown(view: EditorView, markdown: string): boolean {
  let blocks: JSONContent[];
  try {
    blocks = markdownToBlockNodes(markdown);
  } catch {
    return false;
  }
  if (blocks.length === 0) return false;

  const { schema } = view.state;
  try {
    const inline = isSingleParagraph(blocks);
    const json = inline ? (blocks[0].content?.[0]?.content ?? []) : blocks;
    const nodes = json.map((node) => schema.nodeFromJSON(node));
    const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  } catch {
    return false;
  }
}

/** A single plain paragraph block → insert its inline content into the line. */
function isSingleParagraph(blocks: JSONContent[]): boolean {
  if (blocks.length !== 1) return false;
  const content = blocks[0]?.content;
  return content?.length === 1 && content[0]?.type === "paragraph";
}

function blocksFromNodes(nodes: RootContent[]): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "heading":
        out.push(headingBlock(node));
        break;
      case "paragraph":
        out.push(paragraphBlock(node));
        break;
      case "list": {
        const start = typeof node.start === "number" ? node.start : 1;
        node.children.forEach((item, index) => out.push(listItemBlock(node, item, start + index)));
        break;
      }
      case "blockquote":
        out.push(blockquoteBlock(node));
        break;
      case "code":
        out.push(codeBlock(node));
        break;
      case "thematicBreak":
        out.push(makeBlock({ type: "horizontalRule" }));
        break;
      case "table":
        out.push(tableBlock(node));
        break;
      default: {
        const fallback = fallbackParagraph(node);
        if (fallback) out.push(fallback);
      }
    }
  }
  return out;
}

function headingBlock(node: Heading): JSONContent {
  const level = Math.min(Math.max(node.depth, 1), MAX_HEADING_LEVEL);
  return makeBlock({ type: "heading", attrs: { level }, content: inlineFrom(node.children) });
}

function paragraphBlock(node: Paragraph): JSONContent {
  const raw = mdastText(node).trim();
  // A paragraph that is solely `$$…$$` becomes a math block. (Inline `$…$` is
  // intentionally left literal to avoid mangling currency like "$5 and $10".)
  const math = /^\$\$([\s\S]+?)\$\$$/.exec(raw);
  if (math && node.children.every((child) => child.type === "text")) {
    return makeBlock({ type: "mathBlock", attrs: { latex: math[1].trim() } });
  }
  // A paragraph that is solely an image becomes an image block.
  if (node.children.length === 1 && node.children[0].type === "image") {
    return imageBlock(node.children[0]);
  }
  return makeBlock({ type: "paragraph", content: inlineFrom(node.children) });
}

function listItemBlock(list: List, item: ListItem, number: number): JSONContent {
  const converted = blocksFromNodes(item.children as RootContent[]);
  const isTask = item.checked === true || item.checked === false;

  if (converted.length === 0) {
    return isTask
      ? makeBlock({ type: "taskLine", attrs: { checked: item.checked }, content: [] }, [], TASK_BLOCK_TYPE)
      : makeBlock({ type: "paragraph" });
  }

  // The item's first converted block supplies the item's own line; everything
  // else (that block's nested children + later blocks) nests underneath. So a
  // `- ## Heading` item becomes a heading block, `- text` a paragraph block.
  const lead = converted[0];
  const leadNode = (lead.content ?? [])[0] ?? { type: "paragraph" };
  const nested = [...(lead.content ?? []).slice(1), ...converted.slice(1)];

  // GFM task item (`- [ ]` / `- [x]`) → a checkbox block. A non-paragraph lead
  // (heading/code/…) can't be a checkbox line, so keep it as a child instead.
  if (isTask) {
    if (leadNode.type === "paragraph") {
      return makeBlock({ type: "taskLine", attrs: { checked: item.checked }, content: leadNode.content ?? [] }, nested, TASK_BLOCK_TYPE);
    }
    return makeBlock({ type: "taskLine", attrs: { checked: item.checked }, content: [] }, converted, TASK_BLOCK_TYPE);
  }

  // Ordered items keep their number as literal text (the schema has no ordered
  // list node) when the lead is a plain paragraph line.
  if (list.ordered && leadNode.type === "paragraph") {
    return makeBlock({ type: "paragraph", content: [textNode(`${number}. `), ...(leadNode.content ?? [])] }, nested);
  }
  return makeBlock(leadNode, nested);
}

function blockquoteBlock(node: Blockquote): JSONContent {
  // Blockquote content is `blockContent+` (not blocks), so its children flatten
  // to content nodes — multiple paragraphs stay inside the one blockquote.
  const inner: JSONContent[] = [];
  for (const child of node.children as RootContent[]) {
    if (child.type === "paragraph") inner.push({ type: "paragraph", content: inlineFrom(child.children) });
    else if (child.type === "heading") inner.push({ type: "heading", attrs: { level: Math.min(Math.max(child.depth, 1), MAX_HEADING_LEVEL) }, content: inlineFrom(child.children) });
    else {
      const text = mdastText(child).trim();
      if (text) inner.push({ type: "paragraph", content: [textNode(text)] });
    }
  }
  if (inner.length === 0) inner.push({ type: "paragraph" });
  return makeBlock({ type: "blockquote", content: inner });
}

function codeBlock(node: Code): JSONContent {
  const content = node.value ? [textNode(node.value)] : [];
  return makeBlock({ type: "codeBlock", attrs: { language: node.lang || null }, content });
}

function tableBlock(node: Table): JSONContent {
  const rows = node.children.map((row, rowIndex) => ({
    type: "tableRow",
    content: row.children.map((cell) => ({
      type: rowIndex === 0 ? "tableHeader" : "tableCell",
      content: [{ type: "paragraph", content: inlineFrom(cell.children) }],
    })),
  }));
  return makeBlock({ type: "table", content: rows });
}

function imageBlock(node: Image): JSONContent {
  return makeBlock({ type: "image", attrs: { src: node.url, alt: node.alt ?? null, title: node.title ?? null } });
}

/** Last resort: keep any node's text rather than dropping content. */
function fallbackParagraph(node: RootContent): JSONContent | null {
  const text = mdastText(node).trim();
  return text ? makeBlock({ type: "paragraph", content: [textNode(text)] }) : null;
}

// ── Inline ──────────────────────────────────────────────────────────────────

function inlineFrom(nodes: PhrasingContent[]): JSONContent[] {
  return nodes.flatMap(inlineNode);
}

function inlineNode(node: PhrasingContent): JSONContent[] {
  switch (node.type) {
    case "text":
      return softBreaks(node.value);
    case "strong":
      return withMark(inlineFrom(node.children), { type: "bold" });
    case "emphasis":
      return withMark(inlineFrom(node.children), { type: "italic" });
    case "delete":
      return withMark(inlineFrom(node.children), { type: "strike" });
    case "inlineCode":
      return [{ type: "text", text: node.value, marks: [{ type: "code" }] }];
    case "link": {
      const inner = inlineFrom((node as Link).children);
      const text = inner.length > 0 ? inner : [textNode((node as Link).url)];
      return withMark(text, { type: "link", attrs: { href: (node as Link).url } });
    }
    case "break":
      return [{ type: "hardBreak" }];
    case "image":
      return node.alt ? [textNode(node.alt)] : [];
    default: {
      // inlineMath, footnoteReference, html, etc. — keep any literal text.
      const value = "value" in node && typeof node.value === "string" ? node.value : "";
      if (value) return [textNode(value)];
      return "children" in node && Array.isArray(node.children) ? inlineFrom(node.children as PhrasingContent[]) : [];
    }
  }
}

type MarkJSON = { type: string; attrs?: Record<string, unknown> };

/** Add a mark to each text node in a run (hard breaks pass through untouched). */
function withMark(nodes: JSONContent[], mark: MarkJSON): JSONContent[] {
  return nodes.map((node) => {
    if (node.type !== "text") return node;
    const existing = Array.isArray(node.marks) ? node.marks : [];
    if (existing.some((m) => m.type === mark.type)) return node;
    return { ...node, marks: [...existing, mark] };
  });
}

function textNode(text: string): JSONContent {
  return { type: "text", text };
}

/**
 * Split a text value on soft line breaks, emitting a `hardBreak` between lines
 * so a soft-wrapped markdown paragraph keeps its lines (a raw "\n" in a PM text
 * node would collapse to a space). Matches the "multiline via hardBreak"
 * invariant enforced by BlockNormalize.
 */
function softBreaks(value: string): JSONContent[] {
  if (!value) return [];
  const parts = value.split("\n");
  const out: JSONContent[] = [];
  parts.forEach((part, index) => {
    if (index > 0) out.push({ type: "hardBreak" });
    if (part) out.push(textNode(part));
  });
  return out;
}

/** Concatenate the visible text of an mdast subtree. */
function mdastText(node: RootContent | PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node && Array.isArray(node.children)) {
    return (node.children as (RootContent | PhrasingContent)[]).map(mdastText).join("");
  }
  return "";
}

function makeBlock(contentNode: JSONContent, childBlocks: JSONContent[] = [], blockType: string = DEFAULT_BLOCK_TYPE): JSONContent {
  return {
    type: BLOCK_NODE_TYPE,
    attrs: { blockId: null, blockType },
    content: [contentNode, ...childBlocks],
  };
}

// ── Detection ─────────────────────────────────────────────────────────────

const BLOCK_HINT = /^\s{0,3}(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```|~~~|(-{3,}|\*{3,}|_{3,})\s*$)/m;
const TABLE_DELIMITER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/m;
const TASK_ITEM = /^\s*[-*+]\s+\[[ xX]\]\s/m;
const LINK_OR_IMAGE = /!?\[[^\]]*\]\([^)]+\)/;
const BLOCK_MATH = /\$\$[^$]+\$\$/;
const INLINE_EMPHASIS = /(\*\*|__)[^*_\s][^*_]*\1|(?:^|\s)[*_][^*_\s][^*_]*[*_]|`[^`]+`|~~[^~]+~~/;

/**
 * Heuristic: does this text look like markdown worth parsing on paste? True on
 * block syntax (headings, lists, quotes, fences, rules, tables, tasks) or a
 * strong inline signal (links, block math, emphasis). Ordinary prose stays
 * plain. Misclassification is recoverable — the paste is one transaction, so a
 * single Ctrl+Z restores the literal text.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false;
  const hasBlock = BLOCK_HINT.test(text) || TABLE_DELIMITER.test(text) || TASK_ITEM.test(text);
  const hasInline = LINK_OR_IMAGE.test(text) || BLOCK_MATH.test(text) || INLINE_EMPHASIS.test(text);
  return hasBlock || hasInline;
}

const STRUCTURED_HTML_TAG = /<(h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|img|a|strong|em|b|i|u|s|code|hr)\b/i;

/** True when HTML carries real structure/formatting, not just a text wrapper. */
function isStructuredHtml(html: string): boolean {
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  if (STRUCTURED_HTML_TAG.test(body)) return true;
  // A single wrapping <p>/<div> around text isn't structure; several are.
  return (body.match(/<p\b/gi) ?? []).length > 1;
}

/**
 * The markdown text to parse from a paste, or null to let ProseMirror's native
 * paste run. Prefer an explicit `text/markdown` flavor; otherwise treat
 * `text/plain` as markdown only when it looks like markdown AND the clipboard
 * carries no genuinely structured `text/html` (rich HTML pastes cleanly on the
 * native path, so we never intercept those).
 */
export function clipboardMarkdown(clipboard: DataTransfer | null): string | null {
  if (!clipboard) return null;
  const explicit = clipboard.getData("text/markdown").trim();
  if (explicit) return explicit;
  const plain = clipboard.getData("text/plain");
  if (!plain.trim()) return null;
  const html = clipboard.getData("text/html");
  if (html && isStructuredHtml(html)) return null;
  return looksLikeMarkdown(plain) ? plain : null;
}

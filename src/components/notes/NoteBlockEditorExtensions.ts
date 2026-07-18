import { Extension, InputRule, markInputRule, markPasteRule } from "@tiptap/core";
import { isValid, format } from "date-fns";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE, TASK_BLOCK_TYPE } from "@/lib/notes/editor/block-document";
import { BLOCK_COLORS } from "@/components/notes/NoteBlockEditorColor";
import { TASK_LINE_NODE } from "@/components/notes/editor/TaskLineNode";

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const markdownLinkInputRegex = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)$/;
const markdownLinkPasteRegex = /(?:^|\s)\[([^\]]+)\]\((\S+?)\)/g;

// ---------------------------------------------------------------------------
// Reference decorations plugin
// ---------------------------------------------------------------------------

const referenceDecorationsKey = new PluginKey("noteReferenceDecorations");

export const ReferenceDecorations = Extension.create({
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

              for (const match of node.text.matchAll(/\{([^}]+)\}/g)) {
                if (match.index === undefined) continue;
                if (match[1].length < 6) continue;
                const parsed = Date.parse(match[1]);
                if (isNaN(parsed)) continue;

                const start = pos + match.index;
                const end = start + match[0].length;
                decorations.push(
                  Decoration.inline(start, end, { class: "note-date-token" }),
                  // Hide the literal `{`/`}` delimiters so only the date shows.
                  Decoration.inline(start, start + 1, { class: "note-date-token-edge" }),
                  Decoration.inline(end - 1, end, { class: "note-date-token-edge" }),
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

// ---------------------------------------------------------------------------
// Date auto-format
// ---------------------------------------------------------------------------

export const DateAutoFormat = Extension.create({
  name: "dateAutoFormat",

  addInputRules() {
    return [
      new InputRule({
        find: /\{([^}]+)\}$/,
        handler: ({ state, range, match }) => {
          const dateStr = match[1];
          const parsed = new Date(dateStr);
          if (!isValid(parsed)) return;
          const formatted = `{${format(parsed, "MMM d, yyyy")}}`;
          if (formatted === match[0]) return;
          const { tr } = state;
          tr.replaceWith(range.from, range.to, state.schema.text(formatted));
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Task checkbox shortcut
// ---------------------------------------------------------------------------

/**
 * Markdown-style checkbox: typing `[] `, `[ ] ` or `[x] ` (optionally prefixed
 * with `- `/`* `) at the start of a paragraph turns the block into a task
 * (one `taskLine` per block, matching the slash `/todo` command). Keyboard-only
 * checklist creation — no list node exists in this schema.
 */
export const TaskShortcut = Extension.create({
  name: "taskShortcut",

  addInputRules() {
    return [
      new InputRule({
        find: /^(?:[-*]\s)?\[( |x|X)?\]\s$/,
        handler: ({ state, range, match }) => {
          const $from = state.selection.$from;
          const depth = $from.depth;
          if ($from.node(depth)?.type.name !== "paragraph") return;
          const blockDepth = depth - 1;
          if (blockDepth < 0 || $from.node(blockDepth)?.type.name !== BLOCK_NODE_TYPE) return;
          const taskType = state.schema.nodes[TASK_LINE_NODE];
          if (!taskType) return;

          const contentPos = $from.before(depth);
          // Only fire when the trigger sits at the very start of the block.
          if (range.from !== contentPos + 1) return;

          const blockPos = $from.before(blockDepth);
          const checked = /x/i.test(match[1] ?? "");
          const { tr } = state;
          tr.delete(range.from, range.to);
          tr.setNodeMarkup(contentPos, taskType, { checked });
          tr.setNodeAttribute(blockPos, "blockType", TASK_BLOCK_TYPE);
          tr.setSelection(TextSelection.near(tr.doc.resolve(contentPos + 1)));
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Markdown link extension
// ---------------------------------------------------------------------------

export const MarkdownLink = Link.extend({
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

// ---------------------------------------------------------------------------
// Block-level atom shortcuts (divider, image)
// ---------------------------------------------------------------------------

/**
 * Replace the current (whole) paragraph with a block-level atom node
 * (horizontalRule / image) and append a fresh empty paragraph block after, so
 * the caret keeps flowing. No-op unless the trigger is the paragraph's entire
 * text at the very start of its block.
 */
function convertBlockToAtom(
  state: EditorState,
  range: { from: number; to: number },
  makeAtom: (schema: Schema) => PMNode,
): void {
  const { schema } = state;
  const $from = state.selection.$from;
  const depth = $from.depth;
  const para = $from.node(depth);
  if (para?.type.name !== "paragraph") return;
  const blockDepth = depth - 1;
  if (blockDepth < 0 || $from.node(blockDepth)?.type.name !== BLOCK_NODE_TYPE) return;
  const contentPos = $from.before(depth);
  // Trigger must start the block; the caret sits at the end of the marker, so
  // the whole line is just the marker (its typed last char isn't in the doc yet).
  if (range.from !== contentPos + 1) return;

  const blockNode = $from.node(blockDepth);
  const afterBlock = $from.before(blockDepth) + blockNode.nodeSize;

  const { tr } = state;
  tr.replaceWith(contentPos, contentPos + para.nodeSize, makeAtom(schema));
  const emptyBlock = schema.nodes[BLOCK_NODE_TYPE].create(
    { blockId: null, blockType: DEFAULT_BLOCK_TYPE },
    schema.nodes.paragraph.create(),
  );
  const insertPos = tr.mapping.map(afterBlock);
  tr.insert(insertPos, emptyBlock);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 2)));
}

const markdownImageRegex = /^!\[([^\]]*)\]\(([^)]+)\)$/;

/** Divider: `---` / `***` / `___` on its own line → a horizontalRule block. */
export const NotesHorizontalRule = HorizontalRule.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /^(?:---|\*\*\*|___)$/,
        handler: ({ state, range }) => {
          convertBlockToAtom(state, range, (schema) => schema.nodes.horizontalRule.create());
        },
      }),
    ];
  },
});

/** Image: `![alt](url)` on its own line → an image block. */
export const NotesImage = Image.extend({
  addInputRules() {
    return [
      new InputRule({
        find: markdownImageRegex,
        handler: ({ state, range, match }) => {
          const src = match[2];
          if (!src) return;
          const alt = match[1] || null;
          convertBlockToAtom(state, range, (schema) => schema.nodes.image.create({ src, alt }));
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Block color shortcut  —  !<color> / !none
// ---------------------------------------------------------------------------

const blockColorRegex = new RegExp(`^!(${Object.keys(BLOCK_COLORS).join("|")}|none|nocolor)\\s$`, "i");

/**
 * Typed block-color trigger (no markdown standard): `!blue `, `!none `, … at the
 * start of a paragraph/heading sets or clears its `BlockColor` background.
 * Restricted to known color keywords, so `!important ` stays plain text; can't
 * collide with the image rule (which needs `![`).
 */
export const BlockColorShortcut = Extension.create({
  name: "blockColorShortcut",

  addInputRules() {
    return [
      new InputRule({
        find: blockColorRegex,
        handler: ({ state, range, match }) => {
          const $from = state.selection.$from;
          const depth = $from.depth;
          const node = $from.node(depth);
          if (node?.type.name !== "paragraph" && node?.type.name !== "heading") return;
          const blockDepth = depth - 1;
          if (blockDepth < 0 || $from.node(blockDepth)?.type.name !== BLOCK_NODE_TYPE) return;
          const contentPos = $from.before(depth);
          if (range.from !== contentPos + 1) return;

          const key = match[1].toLowerCase();
          const color = key === "none" || key === "nocolor" ? null : key;
          const { tr } = state;
          tr.delete(range.from, range.to);
          tr.setNodeMarkup(contentPos, undefined, { ...node.attrs, color });
          tr.setSelection(TextSelection.near(tr.doc.resolve(contentPos + 1)));
        },
      }),
    ];
  },
});

// ---------------------------------------------------------------------------
// Arrow replacement
// ---------------------------------------------------------------------------

export const NotesArrowReplacement = Extension.create({
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

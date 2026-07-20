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
// Link "open in browser" controls
// ---------------------------------------------------------------------------

const EXTERNAL_LINK_SVG =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';

const COPY_SVG =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/** Build the "open in browser" button placed after a link. */
function createLinkOpenButton(href: string): HTMLElement {
  const button = document.createElement("a");
  button.className = "note-link-ctl note-link-open";
  button.href = href;
  button.target = "_blank";
  button.rel = "noopener noreferrer nofollow";
  button.contentEditable = "false";
  button.title = "Open in browser";
  button.setAttribute("aria-label", "Open link in new tab");
  button.innerHTML = EXTERNAL_LINK_SVG;
  // Keep the click from moving the caret / being swallowed by the editor.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer");
  });
  return button;
}

/** Build the "copy link" button placed after a link (briefly confirms with a check). */
function createLinkCopyButton(href: string): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-link-ctl note-link-copy";
  button.contentEditable = "false";
  button.title = "Copy link";
  button.setAttribute("aria-label", "Copy link");
  button.innerHTML = COPY_SVG;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void navigator.clipboard
      ?.writeText(href)
      .then(() => {
        button.innerHTML = CHECK_SVG;
        button.classList.add("is-copied");
        window.setTimeout(() => {
          button.innerHTML = COPY_SVG;
          button.classList.remove("is-copied");
        }, 1200);
      })
      .catch(() => {
        /* clipboard blocked */
      });
  });
  return button;
}

/** One control group (open + copy) rendered just after a link run. */
function createLinkControls(href: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "note-link-ctls";
  wrap.contentEditable = "false";
  wrap.appendChild(createLinkOpenButton(href));
  wrap.appendChild(createLinkCopyButton(href));
  return wrap;
}

const linkOpenControlsKey = new PluginKey("noteLinkOpenControls");

/**
 * Renders a small control group (open-in-browser + copy-link) immediately after
 * each link (links themselves don't open on click — `openOnClick` is false — so
 * this is how you follow one). One group per contiguous link run.
 */
export const LinkOpenControls = Extension.create({
  name: "linkOpenControls",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: linkOpenControlsKey,
        props: {
          decorations(state) {
            const linkType = state.schema.marks.link;
            if (!linkType) return DecorationSet.empty;

            const runs: Array<{ to: number; href: string }> = [];
            let current: { to: number; href: string } | null = null;

            state.doc.descendants((node, pos) => {
              if (!node.isText) {
                current = null;
                return;
              }
              const mark = node.marks.find((m) => m.type === linkType);
              if (!mark) {
                current = null;
                return;
              }
              const href = String(mark.attrs.href ?? "");
              const from = pos;
              const to = pos + node.nodeSize;
              if (current && current.to === from && current.href === href) {
                current.to = to; // extend the contiguous run in place
              } else {
                current = { to, href };
                runs.push(current);
              }
            });

            const decorations = runs
              .filter((run) => run.href)
              .map((run) =>
                Decoration.widget(run.to, () => createLinkControls(run.href), {
                  side: 1,
                  ignoreSelection: true,
                  key: `link-ctls:${run.to}:${run.href}`,
                }),
              );

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
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

import { Extension, InputRule, markPasteRule } from "@tiptap/core";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE, TASK_BLOCK_TYPE } from "@/lib/notes/editor/block-document";
import { parseDateToken } from "@/lib/notes/date-tokens";
import { BLOCK_COLORS } from "@/components/notes/NoteBlockEditorColor";
import { TASK_LINE_NODE } from "@/components/notes/editor/TaskLineNode";
import { normalizeUrl } from "@/lib/tasks/tasks";

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
                if (!parseDateToken(match[1])) continue;

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
// Task checkbox shortcut
// ---------------------------------------------------------------------------

/**
 * Markdown-style checkbox: typing `[] `, `[ ] ` or `[x] ` (optionally prefixed
 * with `- `/`* `) at the start of a paragraph turns the block into a task
 * (one `taskLine` per block, matching the slash `/todo` command). Keyboard-only
 * checklist creation — no list node exists in this schema.
 */
type BlockStartTrigger = {
  /** The block's own content line node (paragraph/heading/…). */
  node: PMNode;
  contentPos: number;
  blockPos: number;
  block: PMNode;
};

/**
 * If `range` starts a block's own content line — the line node sits directly in
 * a `block` and the trigger is at the line's very start — return its positions;
 * else null. Shared by the block input-rule shortcuts, which add their own
 * node-type check (paragraph, heading, …).
 */
function blockStartTrigger(
  state: EditorState,
  range: { from: number; to: number },
): BlockStartTrigger | null {
  const $from = state.selection.$from;
  const depth = $from.depth;
  const blockDepth = depth - 1;
  if (blockDepth < 0) return null;
  const block = $from.node(blockDepth);
  if (block?.type.name !== BLOCK_NODE_TYPE) return null;
  const contentPos = $from.before(depth);
  // The trigger must sit at the very start of the block's content line.
  if (range.from !== contentPos + 1) return null;
  return { node: $from.node(depth), contentPos, blockPos: $from.before(blockDepth), block };
}

export const TaskShortcut = Extension.create({
  name: "taskShortcut",

  addInputRules() {
    return [
      new InputRule({
        find: /^(?:[-*]\s)?\[( |x|X)?\]\s$/,
        handler: ({ state, range, match }) => {
          const trigger = blockStartTrigger(state, range);
          if (!trigger || trigger.node.type.name !== "paragraph") return;
          const taskType = state.schema.nodes[TASK_LINE_NODE];
          if (!taskType) return;

          const { contentPos, blockPos } = trigger;
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
    // Custom (not markInputRule): markInputRule keeps the LAST capture group as
    // the retained text, which here is the URL — so `[label](url)` would drop
    // "label" and show the url linked to itself. Insert the label instead and
    // mark it with the href.
    const linkType = this.type;
    return [
      new InputRule({
        find: markdownLinkInputRegex,
        handler: ({ state, range, match }) => {
          const label = match[1];
          const href = match[2];
          if (!label || !href) return;
          // The regex's `(?:^|\s)` prefix may capture a leading space — keep it.
          const lead = match[0].startsWith("[") ? "" : match[0][0];
          const linkStart = range.from + lead.length;
          const { tr } = state;
          tr.insertText(lead + label, range.from, range.to);
          tr.addMark(linkStart, linkStart + label.length, linkType.create({ href }));
          tr.removeStoredMark(linkType);
        },
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

const EDIT_SVG =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/></svg>';

const UNLINK_SVG =
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" x2="8" y1="2" y2="5"/><line x1="2" x2="5" y1="8" y2="8"/><line x1="16" x2="16" y1="19" y2="22"/><line x1="19" x2="22" y1="16" y2="16"/></svg>';

const OPEN_DELAY = 300;
const CLOSE_DELAY = 150;

/** A small square icon button for the link toolbar. */
function iconButton(svg: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "note-link-ctl";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = svg;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

/**
 * A single floating toolbar, anchored to a link on hover (or tap, on touch),
 * with open / copy / edit / unlink. Being fixed-positioned (outside the text
 * flow) it never reflows text and adds no persistent inline icons. Living in
 * the plugin means every editor instance gets it with no per-page wiring.
 */
class LinkToolbarView {
  private readonly view: EditorView;
  private readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly form: HTMLElement;
  private readonly textInput: HTMLInputElement;
  private readonly urlInput: HTMLInputElement;
  private readonly copyBtn: HTMLButtonElement;

  private currentHref = "";
  private range: { from: number; to: number } | null = null;
  private anchor: HTMLElement | null = null;
  private pointerType: "mouse" | "touch" = "mouse";
  private visible = false;
  private editing = false;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private copyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(view: EditorView) {
    this.view = view;

    const el = document.createElement("div");
    el.className = "note-link-toolbar";
    el.setAttribute("contenteditable", "false");
    el.style.display = "none";

    // Compact action bar
    const bar = document.createElement("div");
    bar.className = "note-link-bar";
    const openBtn = iconButton(EXTERNAL_LINK_SVG, "Open in browser");
    openBtn.addEventListener("click", () => {
      if (this.currentHref) window.open(this.currentHref, "_blank", "noopener,noreferrer");
    });
    const copyBtn = iconButton(COPY_SVG, "Copy link");
    copyBtn.addEventListener("click", () => this.copy());
    const editBtn = iconButton(EDIT_SVG, "Edit link");
    editBtn.addEventListener("click", () => this.setEditing(true));
    const unlinkBtn = iconButton(UNLINK_SVG, "Remove link");
    unlinkBtn.addEventListener("click", () => this.unlink());
    bar.append(openBtn, copyBtn, editBtn, unlinkBtn);
    this.copyBtn = copyBtn;

    // Edit form
    const form = document.createElement("div");
    form.className = "note-link-form";
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "note-link-input";
    textInput.placeholder = "Text";
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "note-link-input";
    urlInput.placeholder = "Link URL";
    for (const input of [textInput, urlInput]) {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.save();
        } else if (event.key === "Escape") {
          event.preventDefault();
          this.setEditing(false);
        }
      });
    }
    const actions = document.createElement("div");
    actions.className = "note-link-form-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "note-link-form-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("mousedown", (event) => event.preventDefault());
    cancelBtn.addEventListener("click", () => this.setEditing(false));
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "note-link-form-save";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("mousedown", (event) => event.preventDefault());
    saveBtn.addEventListener("click", () => this.save());
    actions.append(cancelBtn, saveBtn);
    form.append(textInput, urlInput, actions);
    this.textInput = textInput;
    this.urlInput = urlInput;

    el.append(bar, form);
    document.body.appendChild(el);
    this.el = el;
    this.bar = bar;
    this.form = form;

    // Keep the toolbar open while the pointer is over it.
    el.addEventListener("mouseenter", () => this.clearClose());
    el.addEventListener("mouseleave", () => {
      if (!this.editing) this.scheduleClose();
    });

    view.dom.addEventListener("mouseover", this.onOver);
    view.dom.addEventListener("mouseout", this.onOut);
    view.dom.addEventListener("pointerdown", this.onEditorPointerDown, true);
    view.dom.addEventListener("click", this.onEditorClick);
    document.addEventListener("pointerdown", this.onDocPointerDown, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("scroll", this.onScroll, true);
  }

  private linkAt(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) return null;
    const a = target.closest("a[href]") as HTMLElement | null;
    return a && this.view.dom.contains(a) ? a : null;
  }

  private onOver = (event: Event) => {
    if (this.pointerType === "touch") return;
    const a = this.linkAt(event.target);
    if (!a) return;
    this.clearClose();
    if (this.visible && this.anchor === a) return;
    this.clearOpen();
    this.openTimer = setTimeout(() => this.show(a), OPEN_DELAY);
  };

  private onOut = (event: Event) => {
    const a = this.linkAt(event.target);
    if (!a) return;
    const to = (event as MouseEvent).relatedTarget;
    if (to instanceof HTMLElement && (to.closest("a[href]") === a || this.el.contains(to))) return;
    this.clearOpen();
    if (!this.editing) this.scheduleClose();
  };

  private onEditorPointerDown = (event: Event) => {
    this.pointerType = (event as PointerEvent).pointerType === "touch" ? "touch" : "mouse";
  };

  private onEditorClick = (event: Event) => {
    if (this.pointerType !== "touch") return;
    const a = this.linkAt(event.target);
    if (!a) return;
    event.preventDefault();
    this.show(a);
  };

  private onDocPointerDown = (event: Event) => {
    if (!this.visible || this.editing) return;
    const t = event.target;
    if (t instanceof Node && (this.el.contains(t) || this.linkAt(t))) return;
    this.hide();
  };

  private onKeyDown = (event: Event) => {
    if (!this.visible) return;
    if ((event as KeyboardEvent).key !== "Escape") return;
    if (this.editing) {
      event.preventDefault();
      this.setEditing(false);
    } else {
      this.hide();
    }
  };

  private onScroll = () => {
    if (this.visible && !this.editing) this.hide();
  };

  private clearOpen() {
    if (this.openTimer) clearTimeout(this.openTimer);
    this.openTimer = null;
  }

  private clearClose() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private scheduleClose() {
    this.clearClose();
    this.closeTimer = setTimeout(() => this.hide(), CLOSE_DELAY);
  }

  private show(anchor: HTMLElement) {
    const from = this.view.posAtDOM(anchor, 0);
    const text = anchor.textContent ?? "";
    const to = from + text.length;
    const linkType = this.view.state.schema.marks.link;
    const node = this.view.state.doc.nodeAt(from);
    const mark = linkType ? node?.marks.find((m) => m.type === linkType) : undefined;
    const href = String(mark?.attrs.href ?? anchor.getAttribute("href") ?? "");
    if (!href) return;

    this.currentHref = href;
    this.range = { from, to };
    this.anchor = anchor;
    this.setEditing(false);
    this.el.style.display = "flex";
    this.visible = true;
    this.position();
    requestAnimationFrame(() => this.el.classList.add("is-open"));
  }

  private position() {
    if (!this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    const box = this.el.getBoundingClientRect();
    const margin = 8;
    let top = rect.bottom + 6;
    if (top + box.height > window.innerHeight - margin) {
      const above = rect.top - box.height - 6;
      if (above >= margin) top = above;
    }
    let left = rect.left;
    if (left + box.width > window.innerWidth - margin) left = window.innerWidth - box.width - margin;
    this.el.style.top = `${Math.max(margin, top)}px`;
    this.el.style.left = `${Math.max(margin, left)}px`;
  }

  private setEditing(on: boolean) {
    this.editing = on;
    this.el.classList.toggle("is-editing", on);
    this.bar.style.display = on ? "none" : "flex";
    this.form.style.display = on ? "flex" : "none";
    if (on) {
      this.textInput.value = this.anchor?.textContent ?? "";
      this.urlInput.value = this.currentHref;
      this.position();
      this.urlInput.focus();
      this.urlInput.select();
    }
  }

  private copy() {
    if (!this.currentHref) return;
    void navigator.clipboard
      ?.writeText(this.currentHref)
      .then(() => {
        this.copyBtn.innerHTML = CHECK_SVG;
        this.copyBtn.classList.add("is-copied");
        if (this.copyTimer) clearTimeout(this.copyTimer);
        this.copyTimer = setTimeout(() => {
          this.copyBtn.innerHTML = COPY_SVG;
          this.copyBtn.classList.remove("is-copied");
        }, 1200);
      })
      .catch(() => {
        /* clipboard blocked */
      });
  }

  private save() {
    const url = this.urlInput.value.trim();
    if (!this.range) return this.hide();
    if (!url) return this.unlink();
    const { state } = this.view;
    const linkType = state.schema.marks.link;
    if (!linkType) return this.hide();
    const { from, to } = this.range;
    const text = this.textInput.value.trim() || url;
    const href = normalizeUrl(url);
    const tr = state.tr.insertText(text, from, to);
    tr.addMark(from, from + text.length, linkType.create({ href }));
    this.view.dispatch(tr);
    this.view.focus();
    this.hide();
  }

  private unlink() {
    const { state } = this.view;
    const linkType = state.schema.marks.link;
    if (this.range && linkType) {
      this.view.dispatch(state.tr.removeMark(this.range.from, this.range.to, linkType));
      this.view.focus();
    }
    this.hide();
  }

  private hide() {
    this.clearOpen();
    this.clearClose();
    this.visible = false;
    this.editing = false;
    this.el.classList.remove("is-open", "is-editing");
    this.el.style.display = "none";
    this.bar.style.display = "flex";
    this.form.style.display = "none";
    this.anchor = null;
    this.range = null;
  }

  destroy() {
    this.clearOpen();
    this.clearClose();
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.view.dom.removeEventListener("mouseover", this.onOver);
    this.view.dom.removeEventListener("mouseout", this.onOut);
    this.view.dom.removeEventListener("pointerdown", this.onEditorPointerDown, true);
    this.view.dom.removeEventListener("click", this.onEditorClick);
    document.removeEventListener("pointerdown", this.onDocPointerDown, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("scroll", this.onScroll, true);
    this.el.remove();
  }
}

const linkOpenControlsKey = new PluginKey("noteLinkOpenControls");

/**
 * A floating toolbar anchored to each link on hover (desktop) / tap (touch):
 * open, copy, edit (URL + text), unlink. Links don't open on click
 * (`openOnClick` is false), so this is how you act on one. Fixed-positioned, so
 * it never reflows text or leaves persistent inline icons.
 */
export const LinkOpenControls = Extension.create({
  name: "linkOpenControls",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: linkOpenControlsKey,
        view: (editorView) => new LinkToolbarView(editorView),
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
  // Trigger must start the block; the caret sits at the end of the marker, so
  // the whole line is just the marker (its typed last char isn't in the doc yet).
  const trigger = blockStartTrigger(state, range);
  if (!trigger || trigger.node.type.name !== "paragraph") return;
  const { node: para, contentPos, blockPos, block: blockNode } = trigger;
  const afterBlock = blockPos + blockNode.nodeSize;

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
          const trigger = blockStartTrigger(state, range);
          if (!trigger || (trigger.node.type.name !== "paragraph" && trigger.node.type.name !== "heading")) return;
          const { node, contentPos } = trigger;

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

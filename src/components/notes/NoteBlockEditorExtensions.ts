import { Extension, InputRule, markInputRule, markPasteRule } from "@tiptap/core";
import { isValid, format } from "date-fns";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Link from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

              for (const match of node.text.matchAll(/\{([^}]+)\}/g)) {
                if (match.index === undefined) continue;
                if (match[1].length < 6) continue;
                const parsed = Date.parse(match[1]);
                if (isNaN(parsed)) continue;

                decorations.push(
                  Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
                    class: "note-date-token",
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
// Horizontal rule (no input rules)
// ---------------------------------------------------------------------------

export const NotesHorizontalRule = HorizontalRule.extend({
  addInputRules() {
    return [];
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

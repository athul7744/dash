import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { isValid } from "date-fns";

import { DATE_TOKEN_NODE_TYPE, formatDateLabel } from "@/lib/notes/date-tokens";

/**
 * `dateToken` — an inline, atomic node for a date, the sibling of `entityRef`
 * (see EntityRefNode). Dates used to be styled plain text with the `{`/`}`
 * delimiters hidden by a decoration; a non-rendered delimiter has no caret
 * positions, so the cursor got trapped inside a trailing date. As an atom the
 * chip is one unit — the caret steps over it and can't land inside — and every
 * chip in the editor (references, dates) is now the same kind of thing.
 *
 * The node carries only the display `date` ("MMM d, yyyy"); it serializes back
 * to the `{MMM d, yyyy}` token via `renderText`, so plain-text/markdown output
 * is unchanged and legacy stored text tokens keep resolving. The teal chip look
 * (calendar glyph + dotted underline) is the shared `.note-date-token` style.
 */
export const DateTokenNode = Node.create({
  name: DATE_TOKEN_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      date: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-date-token]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return { date: node.getAttribute("data-date") || node.textContent || "" };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const date = (node.attrs.date as string) || "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-date-token": "true",
        "data-date": date,
        class: "note-date-token",
      }),
      date,
    ];
  },

  renderText({ node }) {
    return `{${(node.attrs.date as string) || ""}}`;
  },

  addInputRules() {
    // Typing `{<a parseable date>}` becomes a date chip (replaces the old
    // reformat-in-place rule). Unparseable `{…}` is left as literal text.
    return [
      new InputRule({
        find: /\{([^}]+)\}$/,
        handler: ({ state, range, match }) => {
          const parsed = new Date(match[1]);
          if (!isValid(parsed)) return null;
          const dateNode = this.type.create({ date: formatDateLabel(parsed) });
          state.tr.replaceWith(range.from, range.to, dateNode);
        },
      }),
    ];
  },
});

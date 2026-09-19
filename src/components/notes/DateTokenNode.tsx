"use client";

import { InputRule, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useRouter } from "next/navigation";

import { DATE_TOKEN_NODE_TYPE, dateLabelToToken, formatDateLabel, parseDateToken } from "@/lib/notes/date-tokens";
import { localDateKey } from "@/lib/tracker/day-keys";

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
 *
 * Clicking one opens that day (`/day/<yyyy-MM-dd>`) — the label is parsed back
 * to a date, since the attr holds only what it displays. Rendered through a
 * React NodeView for that; `renderHTML` stays as the non-editor fallback (the
 * read-only renderer makes chips inert anyway).
 */
function DateChip({ node }: NodeViewProps) {
  const router = useRouter();
  const label = (node.attrs.date as string) || "";
  const parsed = parseDateToken(label);

  return (
    <NodeViewWrapper as="span" data-date-token="true" data-date={label}>
      <span
        role={parsed ? "link" : undefined}
        tabIndex={parsed ? 0 : undefined}
        contentEditable={false}
        title={parsed ? `Open ${label}` : label}
        className="note-date-token"
        onClick={() => {
          if (parsed) router.push(`/day/${localDateKey(parsed)}`);
        }}
        onKeyDown={(event) => {
          if (!parsed || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          router.push(`/day/${localDateKey(parsed)}`);
        }}
      >
        {label}
      </span>
    </NodeViewWrapper>
  );
}

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

  addNodeView() {
    return ReactNodeViewRenderer(DateChip);
  },

  renderText({ node }) {
    return dateLabelToToken((node.attrs.date as string) || "");
  },

  addInputRules() {
    // Typing `{<a parseable date>}` becomes a date chip (replaces the old
    // reformat-in-place rule). Unparseable `{…}` is left as literal text.
    return [
      new InputRule({
        find: /\{([^}]+)\}$/,
        handler: ({ state, range, match }) => {
          const parsed = parseDateToken(match[1]);
          if (!parsed) return null;
          const dateNode = this.type.create({ date: formatDateLabel(parsed) });
          state.tr.replaceWith(range.from, range.to, dateNode);
        },
      }),
    ];
  },
});

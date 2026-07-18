"use client";

/**
 * In-document `queryBlock` node for the single-document editor.
 *
 * Query blocks already store their config as a note document holding a single
 * `queryBlock` node (see query-block-content.ts), so this node just makes that
 * type known to the schema and renders the existing `QueryBlockView` through a
 * React NodeView. Config edits flow back into the node's attrs via
 * `updateAttributes`, which decompose serializes to the exact stored shape.
 *
 * It's an atom in the `blockContent` group, so it lives inside a `block`
 * wrapper like any other content node.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

import { QueryBlockView } from "@/components/notes/QueryBlockView";
import {
  QUERY_BLOCK_NODE_TYPE,
  encodeQueryConfig,
  decodeQueryConfig,
} from "@/lib/notes/query-block-content";

import { BLOCK_CONTENT_GROUP } from "@/lib/notes/editor/block-schema";

function QueryBlockComponent({ node, updateAttributes }: ReactNodeViewProps) {
  const content = JSON.stringify({ type: "doc", content: [{ type: QUERY_BLOCK_NODE_TYPE, attrs: node.attrs }] });
  const onUpdateContent = (next: unknown) => {
    const config = decodeQueryConfig(next);
    const attrs = encodeQueryConfig(config).content[0].attrs;
    updateAttributes(attrs);
  };

  return (
    <NodeViewWrapper className="note-query-block" contentEditable={false}>
      <QueryBlockView content={content} onUpdateContent={onUpdateContent} />
    </NodeViewWrapper>
  );
}

export const QueryBlock = Node.create({
  name: QUERY_BLOCK_NODE_TYPE,
  group: BLOCK_CONTENT_GROUP,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      filters: { default: [] },
      columns: { default: [] },
      sort: { default: null },
      limit: { default: 20 },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-query-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-query-block": "true" }), ""];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QueryBlockComponent);
  },
});

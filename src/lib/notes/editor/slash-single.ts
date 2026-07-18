/**
 * Slash-command detection + application for the single-document editor.
 *
 * Unlike the legacy per-block editor (whose whole doc was one paragraph), here
 * the trigger is scoped to the current block's content node: a `/query` typed at
 * the start of a paragraph. Applying a command rewrites just that block's
 * content node (paragraph → heading/table/code/…), toggles a color, or converts
 * the block into a query block — never touching sibling or child blocks.
 */

import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";

import type { SlashCommand } from "@/components/notes/NoteBlockEditorSlash";
import { encodeQueryConfig, QUERY_BLOCK_NODE_TYPE } from "@/lib/notes/query-block-content";
import { BLOCK_NODE_TYPE } from "@/lib/notes/editor/block-document";

export interface SlashContext {
  /** Text after the leading "/". */
  query: string;
  /** Document position just before the block's content node (the paragraph). */
  contentPos: number;
  /** nodeSize of that content node. */
  contentSize: number;
  /** Document position just before the enclosing block wrapper. */
  blockPos: number;
}

/**
 * If the cursor sits in a paragraph whose text is a single `/token` at the start
 * of its block, return the slash context; otherwise null.
 */
export function getSlashContext(editor: Editor): SlashContext | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  const $from = selection.$from;
  const parent = $from.parent;
  if (parent.type.name !== "paragraph") return null;

  const text = parent.textContent;
  // Single token, anchored at the block start (no spaces/newlines).
  if (!text.startsWith("/") || /\s/.test(text)) return null;

  // The paragraph must be a direct child of a `block` wrapper.
  const contentDepth = $from.depth;
  const blockDepth = contentDepth - 1;
  if (blockDepth < 0 || $from.node(blockDepth).type.name !== BLOCK_NODE_TYPE) return null;

  return {
    query: text.slice(1),
    contentPos: $from.before(contentDepth),
    contentSize: parent.nodeSize,
    blockPos: $from.before(blockDepth),
  };
}

/** Apply a slash command against the block described by `ctx`. */
export function applySlashCommand(editor: Editor, command: SlashCommand, ctx: SlashContext): boolean {
  const { schema, view } = editor;

  // Color — keep the paragraph, drop the "/query" text, set the color attr.
  if (command.section === "color") {
    const color = command.id === "color-none" ? null : command.id.replace(/^color-/, "");
    const tr = editor.state.tr;
    tr.delete(ctx.contentPos + 1, ctx.contentPos + ctx.contentSize - 1);
    const node = tr.doc.nodeAt(ctx.contentPos);
    if (node) tr.setNodeMarkup(ctx.contentPos, undefined, { ...node.attrs, color });
    tr.setSelection(TextSelection.near(tr.doc.resolve(ctx.contentPos + 1)));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  // Query — replace the content node with a queryBlock and mark the block type.
  if (command.blockType === "query") {
    const attrs = encodeQueryConfig({ filters: [], limit: 20 }).content[0].attrs;
    const queryNode = schema.nodes[QUERY_BLOCK_NODE_TYPE].create(attrs);
    const tr = editor.state.tr;
    tr.replaceWith(ctx.contentPos, ctx.contentPos + ctx.contentSize, queryNode);
    tr.setNodeAttribute(ctx.blockPos, "blockType", "query");
    tr.setSelection(NodeSelection.create(tr.doc, ctx.contentPos));
    view.dispatch(tr.scrollIntoView());
    view.focus();
    return true;
  }

  // Everything else — swap the paragraph for the command's content node(s).
  const docJson = command.createContent() as JSONContent;
  const nodesJson = Array.isArray(docJson.content) ? docJson.content : [];
  if (nodesJson.length === 0) return false;
  const pmNodes = nodesJson.map((node) => schema.nodeFromJSON(node));
  const tr = editor.state.tr;
  tr.replaceWith(ctx.contentPos, ctx.contentPos + ctx.contentSize, pmNodes);
  tr.setSelection(Selection.near(tr.doc.resolve(ctx.contentPos + 1), 1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

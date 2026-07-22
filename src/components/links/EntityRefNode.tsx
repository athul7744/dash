"use client";

/**
 * `entityRef` — an inline, atomic TipTap node that renders an id-bound link to
 * any entity (note / task / bookmark / quote / reminder) as a chip. It is the
 * in-editor form of the `[[label|kind:id]]` token: the node carries the target
 * `kind` + `id` (and a `label` snapshot), serializes back to that token via
 * `renderText`, and opens the target on click by dispatching `OPEN_ENTITY_EVENT`
 * (a provider listens and shows the EntityPopup / navigates).
 *
 * Shared by the notes editor and the cards' RefField, so it stays schema-neutral
 * (just an inline atom — no dependency on the notes block schema). The chip is a
 * React NodeView so it can show each entity's own icon in its accent colour.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import type { CSSProperties } from "react";

import { formatRefToken, refKindAccentVar, ENTITY_REF_NODE_TYPE, type RefKind } from "@/lib/links/tokens";
import { getApp } from "@/lib/shared/apps";

export const ENTITY_REF_NODE = ENTITY_REF_NODE_TYPE;

/** Fired when a chip is clicked; a provider opens the target. */
export const OPEN_ENTITY_EVENT = "dash:open-entity";

export type OpenEntityDetail = { kind: RefKind; id: string };

/** Emit the open event for a reference chip (also usable outside the editor). */
export function dispatchOpenEntity(kind: RefKind, id: string) {
  window.dispatchEvent(new CustomEvent<OpenEntityDetail>(OPEN_ENTITY_EVENT, { detail: { kind, id } }));
}

function EntityRefChip({ node }: NodeViewProps) {
  const kind = (node.attrs.kind as RefKind | null) ?? "note";
  const id = node.attrs.id as string | null;
  const label = (node.attrs.label as string) || "Untitled";
  const app = getApp(`${kind}s`);
  const Icon = app.icon;

  return (
    <NodeViewWrapper as="span" className="entity-ref-chip-wrap" data-entity-ref="true">
      <span
        role="link"
        tabIndex={0}
        contentEditable={false}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          if (kind && id) dispatchOpenEntity(kind, id);
        }}
        className="entity-ref-chip"
        style={{ "--chip": refKindAccentVar(kind) } as CSSProperties}
      >
        <Icon className="size-[0.9em] shrink-0" />
        <span>{label}</span>
      </span>
    </NodeViewWrapper>
  );
}

export const EntityRefNode = Node.create({
  name: ENTITY_REF_NODE_TYPE,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: { default: null },
      id: { default: null },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-entity-ref]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return {
            kind: node.getAttribute("data-kind") || null,
            id: node.getAttribute("data-id") || null,
            label: node.getAttribute("data-label") || node.textContent || "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const kind = (node.attrs.kind as string | null) ?? "note";
    const label = (node.attrs.label as string) || "Untitled";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-entity-ref": "true",
        "data-kind": node.attrs.kind ?? "",
        "data-id": node.attrs.id ?? "",
        "data-label": label,
        class: `note-ref-token note-ref-token-${kind}`,
      }),
      label,
    ];
  },

  renderText({ node }) {
    return formatRefToken({
      label: (node.attrs.label as string) || "Untitled",
      kind: (node.attrs.kind as RefKind | null) ?? undefined,
      id: (node.attrs.id as string | null) ?? undefined,
    });
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityRefChip);
  },
});

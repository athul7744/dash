"use client";

/**
 * `linkEmbed` — a link rendered as a card: title, description, host, thumbnail.
 *
 * An atom in the `blockContent` group, so it lives inside a `block` wrapper like
 * any other block-level content. Its attrs are the whole card (see
 * `link-embed.ts`): nothing is fetched at render time, so a note opens the same
 * offline as online, and the thumbnail resolves through the ordinary attachment
 * chain (`useImageSource`) exactly as an inline image does.
 *
 * `renderText` gives the URL, so the card degrades to the link it was made from
 * wherever plain text is what's stored or exported.
 */

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { Check, Copy, ExternalLink, Link2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useImageSource } from "@/hooks/use-image-source";
import { BLOCK_CONTENT_GROUP } from "@/lib/notes/editor/block-schema";
import { refetchLinkEmbed } from "@/lib/notes/editor/link-embed-insert";
import {
  deleteEntityAttachments,
  insertAttachmentRow,
  keepOnlyBlockAttachment,
} from "@/lib/storage/attachments";
import {
  isEmbeddableUrl,
  LINK_EMBED_NODE_TYPE,
  linkEmbedText,
  mergeLinkEmbedEdit,
  parseLinkEmbedAttrs,
} from "@/lib/notes/link-embed";

function LinkEmbedCard({ node, deleteNode, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const attrs = parseLinkEmbedAttrs(node.attrs);
  const { url, title, description, host } = attrs;
  const image = useImageSource(attrs.image);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ url, title });
  const [saving, setSaving] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const openEditor = () => {
    setDraft({ url, title });
    setEditing(true);
  };

  /**
   * The thumbnail has to be stored against a real block, and the card's own
   * block is the one wrapping this node.
   */
  const owningBlockId = (): string | null => {
    try {
      const pos = getPos();
      if (typeof pos !== "number") return null;
      const blockId = editor.state.doc.resolve(pos).parent.attrs?.blockId;
      return typeof blockId === "string" ? blockId : null;
    } catch {
      return null;
    }
  };

  const save = async () => {
    if (saving) return;
    const nextUrl = draft.url.trim();
    if (!isEmbeddableUrl(nextUrl)) return;

    const addressChanged = nextUrl !== url;
    const blockId = owningBlockId();
    setSaving(true);
    try {
      // Only a changed address is worth a round trip; a relabel is local.
      const refetch = addressChanged && blockId ? await refetchLinkEmbed(nextUrl, blockId) : null;
      const next = mergeLinkEmbedEdit(attrs, { url: nextUrl, title: draft.title }, refetch);
      updateAttributes(next);
      if (refetch?.stored) await insertAttachmentRow(refetch.stored);

      // Leave the block owning just this card's thumbnail. Not only the one id
      // being replaced: a card edited before this cleaned up still carries those
      // earlier versions, and nothing else will ever reclaim them — the orphan
      // sweep only looks for files with no row, and the rail won't delete a
      // block-owned file because that would strand the block pointing at it.
      if (blockId && next.image) await keepOnlyBlockAttachment(blockId, next.image);
      // A new address with no picture of its own: the block should now own none.
      else if (blockId && attrs.image) await deleteEntityAttachments(blockId);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <NodeViewWrapper className="note-link-embed" contentEditable={false}>
        <form
          className="note-link-embed-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setEditing(false);
            }
          }}
        >
          <input
            autoFocus
            type="text"
            value={draft.url}
            onChange={(event) => setDraft((d) => ({ ...d, url: event.target.value }))}
            placeholder="https://…"
            aria-label="Web address"
            disabled={saving}
          />
          <input
            type="text"
            value={draft.title}
            onChange={(event) => setDraft((d) => ({ ...d, title: event.target.value }))}
            placeholder="Title"
            aria-label="Card title"
            disabled={saving}
          />
          <div className="note-link-embed-form-actions">
            <button type="button" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !isEmbeddableUrl(draft.url)}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="note-link-embed" contentEditable={false}>
      {/* A card's own actions. The editor's link toolbar can't serve one: that
          edits a link *mark*, and a card is a node — there is no mark to change,
          and removing it means removing the block. */}
      <div className="note-link-embed-actions">
        <button
          type="button"
          title="Open in browser"
          aria-label="Open in browser"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" title="Copy link" aria-label="Copy link" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <button type="button" title="Edit link" aria-label="Edit link" onClick={openEditor}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" title="Remove card" aria-label="Remove card" onClick={() => deleteNode()}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      {/* The anchor is the whole card. `contentEditable={false}` above means the
          editor treats it as one unit, so a plain link here behaves. */}
      <a href={url} target="_blank" rel="noreferrer noopener" className="note-link-embed-card" title={url}>
        <span className="note-link-embed-body">
          <span className="note-link-embed-host">
            <Link2 className="h-3 w-3 shrink-0" aria-hidden />
            {host || url}
          </span>
          <span className="note-link-embed-title">{title || host || url}</span>
          {description ? <span className="note-link-embed-description">{description}</span> : null}
        </span>
        {image.url ? (
          // Decorative: the title and description already say what the card is.
          <span className="note-link-embed-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt="" loading="lazy" />
          </span>
        ) : null}
      </a>
    </NodeViewWrapper>
  );
}

export const LinkEmbedNode = Node.create({
  name: LINK_EMBED_NODE_TYPE,
  group: BLOCK_CONTENT_GROUP,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      image: { default: null },
      host: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-link-embed]",
        getAttrs: (el) => {
          const node = el as HTMLElement;
          return {
            url: node.getAttribute("href") || "",
            title: node.getAttribute("data-title") || "",
            description: node.getAttribute("data-description") || "",
            image: node.getAttribute("data-image") || null,
            host: node.getAttribute("data-host") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = parseLinkEmbedAttrs(node.attrs);
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-link-embed": "true",
        href: attrs.url,
        "data-title": attrs.title,
        "data-description": attrs.description,
        "data-image": attrs.image ?? "",
        "data-host": attrs.host,
        class: "note-link-embed-card",
        target: "_blank",
        rel: "noreferrer noopener",
      }),
      attrs.title || attrs.url,
    ];
  },

  renderText({ node }) {
    return linkEmbedText(parseLinkEmbedAttrs(node.attrs));
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkEmbedCard);
  },
});

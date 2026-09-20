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
import { Check, Copy, ExternalLink, Link2, Trash2 } from "lucide-react";
import { useState } from "react";

import { useImageSource } from "@/hooks/use-image-source";
import { BLOCK_CONTENT_GROUP } from "@/lib/notes/editor/block-schema";
import { LINK_EMBED_NODE_TYPE, linkEmbedText, parseLinkEmbedAttrs } from "@/lib/notes/link-embed";

function LinkEmbedCard({ node, deleteNode }: ReactNodeViewProps) {
  const attrs = parseLinkEmbedAttrs(node.attrs);
  const { url, title, description, host } = attrs;
  const image = useImageSource(attrs.image);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

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

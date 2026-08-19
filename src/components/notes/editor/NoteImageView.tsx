"use client";

/**
 * NodeView for the `image` node.
 *
 * An image in a note is stored as an attachment, and the node carries only its
 * `attachmentId` — never the blob URL, which is per-session and per-device (and
 * would be persisted into the document). The view resolves the id to viewable
 * bytes through the same local-cache-then-download path every other attachment
 * uses, and stays reactive so a file uploaded on one device appears on the next.
 *
 * Images that came in as a plain URL and haven't been adopted into storage yet
 * (see image-adopt.ts) still have `src`, and render straight from it.
 */

import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { ImageOff, Type } from "lucide-react";

import { useAttachment } from "@/hooks/use-attachment";
import { useAttachmentUrl } from "@/hooks/use-attachment-url";
import { usePreviewUrl } from "@/hooks/use-preview-url";
import { cn } from "@/lib/shared/utils";

export function NoteImageView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const attachmentId = typeof node.attrs.attachmentId === "string" ? node.attrs.attachmentId : null;
  const src = typeof node.attrs.src === "string" ? node.attrs.src : null;
  const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";

  // Covers the file stored a moment ago: on screen in the first paint, and stable
  // across the document rebuilds that follow a save.
  const preview = usePreviewUrl(attachmentId);

  const { attachment, isLoading } = useAttachment(attachmentId);
  // Otherwise resolve from the id alone (session cache, then local blob store) so
  // an image doesn't wait on its row query to settle. The real row takes over once
  // it arrives, which is what a cross-device download needs.
  const source = preview || !attachmentId
    ? null
    : (attachment ?? { id: attachmentId, file_path: null, sync_state: null });
  const attachmentUrl = useAttachmentUrl(source);
  const url = preview ?? (attachmentId ? attachmentUrl : src);

  const [editingAlt, setEditingAlt] = useState(false);
  const [draftAlt, setDraftAlt] = useState(alt);
  const altInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAlt) altInputRef.current?.focus();
  }, [editingAlt]);

  const openAltEditor = () => {
    setDraftAlt(alt);
    setEditingAlt(true);
  };

  const commitAlt = () => {
    setEditingAlt(false);
    const next = draftAlt.trim();
    if (next !== alt) updateAttributes({ alt: next || null });
  };

  return (
    <NodeViewWrapper className={cn("note-image", selected && "note-image-selected")} contentEditable={false}>
      {url ? (
        // Local bytes: decoding synchronously presents the image with the frame
        // that introduces it, rather than showing an empty box first.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={alt} decoding={preview ? "sync" : "async"} />
      ) : (
        <Placeholder
          state={placeholderState({ attachmentId, isLoading, syncState: attachment?.sync_state ?? null })}
        />
      )}

      {editor.isEditable ? (
        editingAlt ? (
          <input
            ref={altInputRef}
            value={draftAlt}
            onChange={(event) => setDraftAlt(event.target.value)}
            onBlur={commitAlt}
            onKeyDown={(event) => {
              // The input sits inside the editor's DOM, so without this the
              // editor's structural keys (Enter splits a block, Backspace merges
              // one) would fire while typing a description.
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitAlt();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setEditingAlt(false);
              }
            }}
            placeholder="Describe this image"
            aria-label="Image description"
            className="note-image-alt-input"
          />
        ) : (
          <button
            type="button"
            // Keep the editor from taking the selection back before the input mounts.
            onMouseDown={(event) => event.preventDefault()}
            onClick={openAltEditor}
            title={alt ? `Description: ${alt}` : "Add a description"}
            aria-label={alt ? `Description: ${alt}` : "Add a description"}
            className="note-image-alt-button"
          >
            <Type className="h-3.5 w-3.5" />
            {alt ? <span className="max-w-40 truncate">{alt}</span> : null}
          </button>
        )
      ) : null}
    </NodeViewWrapper>
  );
}

type PlaceholderState = "loading" | "missing" | "failed";

/**
 * A missing row means the file is gone for good. A row that hasn't finished
 * syncing is still on its way — its bytes may live on another device that hasn't
 * uploaded them yet — so that reads as loading, not broken.
 */
function placeholderState({
  attachmentId,
  isLoading,
  syncState,
}: {
  attachmentId: string | null;
  isLoading: boolean;
  syncState: string | null;
}): PlaceholderState {
  if (!attachmentId) return "failed";
  if (isLoading) return "loading";
  if (!syncState) return "missing";
  return syncState === "synced" ? "failed" : "loading";
}

const PLACEHOLDER_TEXT: Record<PlaceholderState, string> = {
  loading: "Loading image…",
  missing: "This image is no longer available",
  failed: "This image couldn't be loaded",
};

function Placeholder({ state }: { state: PlaceholderState }) {
  return (
    <div className="note-image-placeholder" role="img" aria-label={PLACEHOLDER_TEXT[state]}>
      {state === "loading" ? (
        <span className="note-image-shimmer" aria-hidden />
      ) : (
        <>
          <ImageOff className="h-4 w-4" aria-hidden />
          <span>{PLACEHOLDER_TEXT[state]}</span>
        </>
      )}
    </div>
  );
}

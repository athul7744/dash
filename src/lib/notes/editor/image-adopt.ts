/**
 * Pulling remote image URLs into the app's own storage.
 *
 * An image can arrive in a note as a plain URL by several routes — the
 * `![alt](url)` shortcut, pasted markdown, or copying an image off a web page
 * (which pastes as HTML). All of those hotlink: they need the network to render
 * and they break when the source moves. Rather than bolt an async download onto
 * each route, one debounced pass sweeps the document, downloads any image that
 * still points at a URL, stores it as an attachment on its block, and records
 * the attachment id on the node.
 *
 * Best-effort throughout: an image that can't be fetched keeps its URL and stays
 * usable, and the pass no-ops while offline so the next edit retries it.
 */

import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

import { BLOCK_NODE_TYPE } from "@/lib/notes/editor/block-document";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { attachFile, deleteAttachment } from "@/lib/storage/attachments";
import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";

const ADOPT_DELAY_MS = 1500;

export interface AdoptableImage {
  /** The block that owns the image, and so the file. */
  blockId: string;
  src: string;
}

/** Whether a src is a remote URL worth downloading (not inline data, not a session blob). */
export function isAdoptableSrc(src: unknown): src is string {
  return typeof src === "string" && /^https?:\/\//i.test(src);
}

/**
 * Which block owns a node: the nearest enclosing `block`, inherited through
 * containers like blockquotes and table cells. Entering an unstamped block yields
 * null rather than the parent's id — a file must never be attached to a block that
 * doesn't own it. Shared by both walks below so the rule has one definition.
 */
function ownerBlockId(
  typeName: string | undefined,
  attrs: Record<string, unknown> | null | undefined,
  inherited: string | null,
): string | null {
  if (typeName !== BLOCK_NODE_TYPE) return inherited;
  return typeof attrs?.blockId === "string" ? attrs.blockId : null;
}

/**
 * Images still pointing at a remote URL, paired with the block that owns them.
 * Images already backed by an attachment, and blocks that haven't been stamped
 * with an id yet, are skipped — the next pass picks the latter up.
 */
export function findAdoptableImages(doc: JSONContent): AdoptableImage[] {
  const found: AdoptableImage[] = [];
  const seen = new Set<string>();

  const walk = (node: JSONContent, blockId: string | null) => {
    for (const child of node.content ?? []) {
      const childBlockId = ownerBlockId(child.type, child.attrs, blockId);

      if (child.type === "image" && !child.attrs?.attachmentId && isAdoptableSrc(child.attrs?.src)) {
        const src = child.attrs.src;
        const key = `${childBlockId}|${src}`;
        if (childBlockId && !seen.has(key)) {
          seen.add(key);
          found.push({ blockId: childBlockId, src });
        }
      }

      walk(child, childBlockId);
    }
  };

  walk(doc, null);
  return found;
}

/**
 * Extension side: run the pass after edits settle. Editing only — a read-only
 * render of someone else's document shouldn't be writing files.
 */
export const ImageAdopt = Extension.create({
  name: "imageAdopt",

  addStorage() {
    return { timer: null as ReturnType<typeof setTimeout> | null };
  },

  onCreate() {
    schedule(this.editor, this.storage);
  },

  onUpdate() {
    schedule(this.editor, this.storage);
  },

  onDestroy() {
    if (this.storage.timer) clearTimeout(this.storage.timer);
  },
});

type AdoptStorage = { timer: ReturnType<typeof setTimeout> | null };

function schedule(editor: Editor, storage: AdoptStorage): void {
  if (!editor.isEditable) return;
  if (storage.timer) clearTimeout(storage.timer);
  storage.timer = setTimeout(() => {
    storage.timer = null;
    void adoptNow(editor);
  }, ADOPT_DELAY_MS);
}

/** Guards against a second pass picking up an image the first is still fetching. */
const inFlight = new Set<string>();

async function adoptNow(editor: Editor): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const pending = findAdoptableImages(editor.getJSON()).filter(
    (image) => !inFlight.has(`${image.blockId}|${image.src}`),
  );
  if (pending.length === 0) return;

  let adopted = 0;
  for (const image of pending) {
    const key = `${image.blockId}|${image.src}`;
    inFlight.add(key);
    try {
      if (editor.isDestroyed) break;
      const applied = await adoptImage(image, (attachmentId) =>
        !editor.isDestroyed && setAttachmentId(editor, image, attachmentId),
      );
      if (applied) adopted += 1;
    } catch {
      /* best-effort — the URL still renders */
    } finally {
      inFlight.delete(key);
    }
  }

  // The attachment rows reference block ids, so land those rows now.
  if (adopted > 0) flushAllBlockDocumentPersisters();
}

/**
 * Fetch one image's bytes, store them against its block, and hand the attachment
 * id to `apply` — which points the node at it and reports whether it could.
 *
 * Rolls the file back when `apply` declines (the node moved, or the editor went
 * away mid-download). Keeping it would leave a file nothing references, and since
 * the image still carries its URL the next pass would fetch and store it again,
 * accumulating a copy per pass.
 */
export async function adoptImage(
  image: AdoptableImage,
  apply: (attachmentId: string) => boolean,
): Promise<boolean> {
  const blob = await fetchRemoteImage(image.src);
  if (!blob) return false;

  const attachment = await attachFile(blob, { blockId: image.blockId }, {
    fileName: imageFileNameFromUrl(image.src),
    mimeType: blob.type,
  });

  if (apply(attachment.id)) return true;
  await deleteAttachment(attachment).catch(() => {});
  return false;
}

/**
 * Point the node at its stored file. The document may have moved under us, so the
 * node is located afresh by block and src. Kept out of the undo history: this is
 * bookkeeping, not an edit the user made.
 */
function setAttachmentId(editor: Editor, image: AdoptableImage, attachmentId: string): boolean {
  const pos = findImagePos(editor.state.doc, image);
  if (pos === null) return false;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, attachmentId });
  tr.setMeta("addToHistory", false);
  editor.view.dispatch(tr);
  return true;
}

/** Position of the still-unadopted image with this src inside this block. */
function findImagePos(doc: PMNode, image: AdoptableImage): number | null {
  let found: number | null = null;

  const walk = (node: PMNode, start: number, blockId: string | null): void => {
    let pos = start;
    node.forEach((child) => {
      if (found !== null) return;
      const childBlockId = ownerBlockId(child.type.name, child.attrs, blockId);
      if (
        child.type.name === "image" &&
        childBlockId === image.blockId &&
        child.attrs.src === image.src &&
        !child.attrs.attachmentId
      ) {
        found = pos;
        return;
      }
      walk(child, pos + 1, childBlockId);
      pos += child.nodeSize;
    });
  };

  walk(doc, 0, null);
  return found;
}

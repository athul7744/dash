/**
 * Putting image files into a note — the shared path behind paste, drop and the
 * slash menu's file picker.
 *
 * The ordering here is the whole trick. `attachFile` needs a real block id for
 * the storage key, but a node inserted into the editor carries `blockId: null`
 * until `BlockIdPlugin` stamps it, and the `blocks` row itself only lands after
 * the persister's debounce. So the block id is minted *first* — `resolveBlockId`
 * keeps any id already on a node — then the file is attached to it, then the
 * block is inserted carrying both ids, then the document is flushed so the row
 * exists straight away.
 *
 * That ordering is what makes cleanup free: because the `blocks` row exists,
 * removing the image (delete, cut, undo) produces a delete write, and the
 * persister's delete branch already drops the block's attachments. Nothing here
 * has to track files. And because the file is attached before anything is
 * inserted, a failed upload leaves no broken node behind.
 */

import type { JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { v4 as uuidv4 } from "uuid";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE } from "@/lib/notes/editor/block-document";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { insertBlockNodes } from "@/lib/notes/editor/markdown-paste";
import { attachFile, deleteAttachment } from "@/lib/storage/attachments";
import { MAX_ATTACHMENT_BYTES, isAllowed } from "@/lib/storage/paths";
import type { AttachmentRecord } from "@/lib/powersync/AppSchema";

const MAX_MB = Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024);

type StoredFile = Pick<AttachmentRecord, "id" | "file_path">;

export interface ImageInsertOptions {
  /** Document position to insert at (drop point). Defaults to the selection. */
  at?: number;
  /** Reported once per rejected file, and once if the attachment write fails. */
  onError?: (message: string) => void;
}

/** Image files on a clipboard/drag payload, in order. */
export function imageFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data?.files?.length) return [];
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"));
}

/**
 * Whether a paste should be treated as image files rather than text.
 *
 * Only when the clipboard carries no text at all — that's a screenshot or a
 * copied image file. Office apps and web pages put an image *alongside* text or
 * HTML, and those pastes must keep their existing text handling; a web image
 * arrives as HTML with a URL and gets pulled into storage by the adopt pass.
 */
export function clipboardImageFiles(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];
  if (data.getData("text/plain").trim() || data.getData("text/html").trim()) return [];
  return imageFilesFrom(data);
}

/**
 * Store each image file and insert one image block per file. Returns the number
 * inserted. Rejects (wrong type, too big, write failed) are reported through
 * `onError` and skipped — a partial insert still lands.
 */
export async function insertImageFiles(
  view: EditorView,
  files: readonly File[],
  opts: ImageInsertOptions = {},
): Promise<number> {
  const blocks: JSONContent[] = [];
  const stored: StoredFile[] = [];

  for (const file of files) {
    const mimeType = file.type || "application/octet-stream";
    if (!mimeType.startsWith("image/") || !isAllowed(mimeType, file.size)) {
      opts.onError?.(`Couldn't add "${file.name || "image"}" — images only, up to ${MAX_MB} MB.`);
      continue;
    }
    const blockId = uuidv4();
    try {
      const attachment = await attachFile(file, { blockId }, { fileName: file.name || "image", mimeType });
      stored.push(attachment);
      blocks.push(imageBlockNode(blockId, attachment.id));
    } catch {
      opts.onError?.(`Couldn't add "${file.name || "image"}".`);
    }
  }

  if (blocks.length === 0) return 0;
  if (!insertBlockNodes(view, blocks, opts.at)) {
    // The files are already stored but no block will ever reference them, so
    // nothing would reclaim them: the persister's cascade needs a block row, and
    // the orphan sweep only removes objects whose row is gone. Undo the writes.
    await discard(stored);
    opts.onError?.("Couldn't add the image here.");
    return 0;
  }

  // Land the blocks rows now so the persister owns cleanup from this point on.
  flushAllBlockDocumentPersisters();
  return blocks.length;
}

/**
 * Open the OS file picker and resolve the chosen image files (empty if
 * dismissed). A transient input, so it doesn't depend on where in a component
 * tree the caller happens to render.
 */
export function pickImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** Drop stored files nothing ended up pointing at. Best-effort. */
async function discard(stored: readonly StoredFile[]): Promise<void> {
  await Promise.all(stored.map((attachment) => deleteAttachment(attachment).catch(() => {})));
}

/** A `block` holding a single image node, pre-stamped with the id its file was stored under. */
function imageBlockNode(blockId: string, attachmentId: string): JSONContent {
  return {
    type: BLOCK_NODE_TYPE,
    attrs: { blockId, blockType: DEFAULT_BLOCK_TYPE },
    content: [{ type: "image", attrs: { attachmentId } }],
  };
}

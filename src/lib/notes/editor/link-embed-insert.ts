/**
 * Turning a URL into a link card in a note.
 *
 * The ordering is the same one images depend on, and for the same reasons (see
 * `image-insert.ts`): mint the block id first, cache the thumbnail under it,
 * insert the block carrying both ids, flush so the `blocks` row lands, and only
 * then write the `attachments` row — which must follow the row it points at, or
 * the server's foreign key refuses it.
 *
 * Everything the card shows is fetched once, here, and stored. Nothing about
 * rendering a card touches the network, so a note reads the same offline.
 */

import type { EditorView } from "@tiptap/pm/view";
import { v4 as uuidv4 } from "uuid";

import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE } from "@/lib/notes/editor/block-document";
import { flushAllBlockDocumentPersisters } from "@/lib/notes/editor/block-persister";
import { insertBlockNodes } from "@/lib/notes/editor/markdown-paste";
import {
  buildLinkEmbedAttrs,
  isEmbeddableUrl,
  LINK_EMBED_NODE_TYPE,
  type LinkEmbedRefetch,
  type LinkMetadata,
} from "@/lib/notes/link-embed";
import { discardStoredBytes, insertAttachmentRow, storeFileBytes, type StoredBytes } from "@/lib/storage/attachments";
import { downscaleImage, THUMBNAIL_MAX_WIDTH } from "@/lib/storage/downscale";
import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";
import { isAllowed } from "@/lib/storage/paths";

export interface LinkEmbedInsertOptions {
  /** Document position to insert at. Defaults to the selection. */
  at?: number;
  onError?: (message: string) => void;
}

/**
 * Look a URL up through the app's own metadata proxy — the one bookmarks use,
 * which is auth-gated and refuses private hosts. A failure is not an error here:
 * a card with only its URL is still worth having, and is what you get offline.
 */
async function fetchMetadata(url: string): Promise<LinkMetadata | null> {
  try {
    const res = await fetch(`/api/bookmark-metadata?url=${encodeURIComponent(url)}`);
    if (!res.ok) return null;
    return (await res.json()) as LinkMetadata;
  } catch {
    return null;
  }
}

/**
 * Store a card's og:image against its block, or return null.
 *
 * Null is an ordinary outcome: no image, a host that won't serve it, one too
 * large, or no network. The card simply has no thumbnail.
 */
async function storeThumbnail(imageUrl: string | undefined, blockId: string): Promise<StoredBytes | null> {
  if (!imageUrl) return null;
  const fetched = await fetchRemoteImage(imageUrl);
  if (!fetched) return null;

  // Bounded before storing: an og:image is routinely 2400px for a rail a tenth
  // that wide, and the browser's one-pass reduction at that ratio is what makes
  // a banner look ragged. Costs less to sync, too.
  const blob = await downscaleImage(fetched, THUMBNAIL_MAX_WIDTH);
  const mimeType = blob.type || "image/jpeg";
  if (!mimeType.startsWith("image/") || !isAllowed(mimeType, blob.size)) return null;

  // Re-encoding changes the format, and `extFor` trusts a file name's extension
  // over the mime type — so drop the original's rather than store webp bytes
  // under a `.png` key.
  const named = imageFileNameFromUrl(imageUrl, "preview");
  const fileName = blob === fetched ? named : named.replace(/\.[^.]+$/, "");

  try {
    return await storeFileBytes(blob, { blockId }, { fileName, mimeType });
  } catch {
    return null;
  }
}

/**
 * Insert a link card for `url`. Returns whether one landed.
 *
 * Only the insert itself can fail meaningfully — every lookup along the way
 * degrades to a thinner card rather than to nothing.
 */
export async function insertLinkEmbed(
  view: EditorView,
  url: string,
  opts: LinkEmbedInsertOptions = {},
): Promise<boolean> {
  const trimmed = url.trim();
  if (!isEmbeddableUrl(trimmed)) {
    opts.onError?.("That doesn't look like a web address.");
    return false;
  }

  const blockId = uuidv4();
  const metadata = await fetchMetadata(trimmed);
  const thumbnail = await storeThumbnail(metadata?.image, blockId);
  const attrs = buildLinkEmbedAttrs(trimmed, metadata, thumbnail?.id ?? null);

  const inserted = insertBlockNodes(
    view,
    [
      {
        type: BLOCK_NODE_TYPE,
        attrs: { blockId, blockType: DEFAULT_BLOCK_TYPE },
        content: [{ type: LINK_EMBED_NODE_TYPE, attrs }],
      },
    ],
    opts.at,
  );

  if (!inserted) {
    // No block will ever reference these bytes, and nothing has been recorded
    // yet, so dropping the cache is the whole cleanup.
    if (thumbnail) await discardStoredBytes(thumbnail);
    opts.onError?.("Couldn't add the link here.");
    return false;
  }

  await flushAllBlockDocumentPersisters();
  if (thumbnail) await insertAttachmentRow(thumbnail);
  return true;
}

/**
 * Re-read a card's page for an edit that changed the address.
 *
 * The same two lookups the insert makes, and the same tolerance: a page that
 * can't be reached leaves a card with its new URL and host and nothing else,
 * which is still a working link.
 *
 * The thumbnail is stored against the block that already exists, so unlike the
 * insert there is no ordering to arrange — the caller writes the attachment row
 * once the edited attrs are saved. The card's previous image is left where it
 * is, as a replaced page banner is: it is owned by this block and goes when the
 * block does.
 */
export async function refetchLinkEmbed(
  url: string,
  blockId: string,
): Promise<LinkEmbedRefetch & { stored: StoredBytes | null }> {
  const metadata = await fetchMetadata(url);
  const thumbnail = await storeThumbnail(metadata?.image, blockId);
  return { metadata, imageAttachmentId: thumbnail?.id ?? null, stored: thumbnail };
}

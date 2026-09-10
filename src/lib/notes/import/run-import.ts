/**
 * Writing a scanned vault into Notes.
 *
 * Two rules shape everything here.
 *
 * **One transaction per file, not one per import.** A vault where file 300 is
 * malformed must still land the other 499, so each file commits on its own and a
 * failure is recorded rather than thrown. Nothing that awaits I/O — reading the
 * file, storing an image — happens inside a write lock.
 *
 * **Links resolve in a second pass.** `reconcileEntityRefs` drops a `[[Title]]`
 * whose page doesn't exist yet, so a file linking to one imported later would lose
 * the edge. Once every page is in, every imported block is reconciled again
 * against a title index built once.
 */

import type { JSONContent } from "@tiptap/core";
import { v4 as uuidv4 } from "uuid";

import { buildTitleIndex } from "@/lib/links/links";
import { BLOCK_NODE_TYPE, DEFAULT_BLOCK_TYPE, stampBlockIds } from "@/lib/notes/editor/block-document";
import { markdownToBlockNodes } from "@/lib/notes/editor/markdown-paste";
import { createNotePageFromBlockNodes, reconcileNoteBlockEdges } from "@/lib/notes/notes";
import { db } from "@/lib/powersync/db";
import {
  discardStoredBytes,
  insertAttachmentRow,
  storeFileBytes,
  type StoredBytes,
} from "@/lib/storage/attachments";
import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";
import { yieldToUI } from "@/lib/shared/utils";
import type { JsonValue } from "@/lib/shared/types";

import { collectImageNodes, imageSrcOf, isExternalRef, resolveAssetRef, type AssetIndex } from "./asset-index";
import { normalizeLogseqMarkdown } from "./logseq-normalize";
import { bannerAlignPercent, propertyKeyId, splitPropertyList } from "./page-properties";
import { propertyValueFor, type PropertyAction } from "./property-mapping";
import { normalizeTitleKey } from "@/lib/links/tokens";
import { tagNameFor, type TagDecision } from "./tag-mapping";
import type { ScannedFile } from "./scan-import";
import { createTitleAllocator } from "./title-allocator";

/** Blocks re-reconciled per query when resolving links at the end. */
const RECONCILE_BATCH = 100;

export interface ImportMapping {
  /** Property key id → what to do with it. */
  properties: Map<string, PropertyAction>;
  /** Lowercased definition name → definition id, resolved before the run. */
  definitionIds: Map<string, string>;
  /** Tag value id → what to do with it. */
  tags: Map<string, TagDecision>;
  /** Lowercased tag name → tag id, resolved before the run. */
  tagIds: Map<string, string>;
  /** Also tag each page with the folder it came from. */
  tagFolders: boolean;
  /**
   * Fetch images that live at a URL and store them too.
   *
   * Without this they stay hotlinked and are only pulled in when the page is next
   * opened (the editor's adopt pass), which for a whole vault means visiting every
   * page. Off, the import is faster and offline-safe.
   */
  downloadRemoteImages: boolean;
}

export interface ImportFailure {
  path: string;
  message: string;
}

export interface ImportResult {
  pageIds: string[];
  failures: ImportFailure[];
  /** Identifies this run on every page it created, so it can be undone later. */
  batchId: string;
}

export interface RunImportOptions {
  /** Every existing page title, so allocated titles can't collide. */
  existingTitles: readonly string[];
  onProgress?: (done: number, total: number) => void;
}

/** Identifies one import run across every page it creates. */
export interface ImportBatch {
  id: string;
  at: string;
}

export async function runMarkdownImport(
  files: readonly ScannedFile[],
  assets: AssetIndex,
  mapping: ImportMapping,
  options: RunImportOptions,
): Promise<ImportResult> {
  const allocator = createTitleAllocator(options.existingTitles);
  const pageIds: string[] = [];
  const failures: ImportFailure[] = [];
  // Stamped on every page in the run. Per-file timestamps would differ by
  // milliseconds, which is no use for finding "the last import" afterwards.
  const batch: ImportBatch = { id: uuidv4(), at: new Date().toISOString() };

  for (const [index, entry] of files.entries()) {
    try {
      pageIds.push(await importOneFile(entry, assets, mapping, allocator.allocate.bind(allocator), batch));
    } catch (error) {
      failures.push({ path: entry.path, message: error instanceof Error ? error.message : "failed" });
    }
    options.onProgress?.(index + 1, files.length);
    await yieldToUI();
  }

  if (pageIds.length > 0) await resolveImportedLinks(pageIds);

  return { pageIds, failures, batchId: batch.id };
}

async function importOneFile(
  entry: ScannedFile,
  assets: AssetIndex,
  mapping: ImportMapping,
  allocate: (base: string) => string,
  batch: ImportBatch,
): Promise<string> {
  const normalized = normalizeLogseqMarkdown(await entry.file.text());
  const fields = resolvePageFields(entry, normalized.properties, mapping, batch);

  const pageId = uuidv4();
  const title = allocate(fields.title || entry.title);

  // Ids first: an image's file is stored against the block that owns it, so the
  // block needs its id before anything is written.
  const blockNodes = stampBlockIds([
    ...(fields.links.length > 0 ? [linkBlock(fields.links)] : []),
    ...markdownToBlockNodes(normalized.body),
  ]);

  const stored: StoredBytes[] = [];
  let written: string;
  try {
    await storeImageBytes(blockNodes, entry.path, assets, stored, mapping.downloadRemoteImages);

    if (fields.banner) {
      const banner = await storeBannerBytes(
        fields.banner,
        entry.path,
        assets,
        pageId,
        mapping.downloadRemoteImages,
      );
      // A banner the vault referenced but doesn't hold leaves the page without
      // one, rather than pointing at a file that was never stored.
      if (banner) {
        stored.push(banner);
        fields.properties.banner = banner.id;
        if (fields.bannerAlign !== undefined) fields.properties.bannerAlign = fields.bannerAlign;
      }
    }

    written = await createNotePageFromBlockNodes({
      id: pageId,
      title,
      blockNodes,
      properties: fields.properties,
      tagIds: fields.tagIds,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
      // Every imported block is reconciled again at the end against one shared
      // title index. Doing it here as well would scan the whole `pages` table per
      // block, inside the write lock, to produce edges the second pass replaces.
      deferEdges: true,
    });
  } catch (error) {
    // Bytes nothing will ever reference. They're inert without a row — no Storage
    // object exists yet — so dropping them is the whole cleanup.
    await Promise.all(stored.map((bytes) => discardStoredBytes(bytes).catch(() => {})));
    throw error;
  }

  // Rows last, once their page and blocks exist: the upload queue keeps that
  // order, so no `attachments` row reaches the server ahead of the row it points
  // at, which the server refuses and the connector drops. Past the commit the
  // page has landed, so a row that won't write costs its image, not the file.
  for (const bytes of stored) {
    try {
      await insertAttachmentRow(bytes);
    } catch {
      await discardStoredBytes(bytes).catch(() => {});
    }
  }

  return written;
}

// --- Properties → page fields ------------------------------------------------

interface PageFields {
  title: string;
  properties: Record<string, JsonValue>;
  tagIds: string[];
  /** Values the mapping asked to render as `[[links]]`. */
  links: string[];
  /** The raw `banner::` reference, resolved to a file once the page id exists. */
  banner: string | null;
  /** `banner-align::` as a vertical percent, when the vault set one. */
  bannerAlign?: number;
  createdAt?: string;
  updatedAt?: string;
}

function resolvePageFields(
  entry: ScannedFile,
  properties: ReadonlyArray<{ key: string; value: string }>,
  mapping: ImportMapping,
  batch: ImportBatch,
): PageFields {
  const custom: Record<string, JsonValue> = {};
  const leftovers: Record<string, JsonValue> = {};
  const tagIds = new Set<string>();
  const links: string[] = [];
  const fields: PageFields = {
    title: "",
    properties: {},
    tagIds: [],
    links,
    banner: null,
  };

  const applyTagValue = (label: string) => {
    const decision = mapping.tags.get(normalizeTitleKey(label));
    if (!decision) return;
    if (decision.tag && "existingId" in decision.tag) tagIds.add(decision.tag.existingId);
    if (decision.tag && "createName" in decision.tag) {
      const id = mapping.tagIds.get(decision.tag.createName.trim().toLowerCase());
      if (id) tagIds.add(id);
    }
    if (decision.link) links.push(label);
  };

  for (const { key, value } of properties) {
    const keyId = propertyKeyId(key);
    const action = mapping.properties.get(keyId) ?? { kind: "ignore" as const };

    if (action.kind === "ignore") {
      leftovers[key] = value;
      continue;
    }

    if (action.kind === "builtin") {
      switch (action.field) {
        case "title":
          fields.title = value.trim();
          break;
        case "tags":
          for (const label of splitPropertyList(value)) applyTagValue(label);
          break;
        case "emoji":
          fields.properties.emoji = value.trim();
          break;
        case "favorite":
          fields.properties.favorite = /^(true|yes)$/i.test(value.trim());
          break;
        case "created":
          fields.createdAt = isoOrUndefined(value);
          break;
        case "updated":
          fields.updatedAt = isoOrUndefined(value);
          break;
        case "banner":
          fields.banner = value.trim();
          break;
        case "bannerAlign": {
          const align = bannerAlignPercent(value);
          if (align !== null) fields.bannerAlign = align;
          break;
        }
      }
      continue;
    }

    const definitionId =
      action.kind === "existing" ? action.definitionId : mapping.definitionIds.get(action.name.trim().toLowerCase());
    if (!definitionId) {
      leftovers[key] = value;
      continue;
    }
    // Its own type, either way: a date read as text stores an unparseable string
    // and the properties panel can't render it.
    const resolved = propertyValueFor(action.type, value);
    if (resolved !== null) custom[definitionId] = resolved as JsonValue;
  }

  // Inline hashtags only count when the mapping opted them in.
  for (const hashtag of entry.hashtags) applyTagValue(hashtag);

  if (mapping.tagFolders) {
    const folder = folderNameOf(entry.path);
    // Through the same naming as any created tag, and looked up under it.
    const id = folder ? mapping.tagIds.get(tagNameFor(folder).toLowerCase()) : undefined;
    if (id) tagIds.add(id);
  }

  if (Object.keys(custom).length > 0) fields.properties.custom = custom;
  if (Object.keys(leftovers).length > 0) fields.properties.importedFrontmatter = leftovers;
  fields.properties.importedFrom = entry.path;
  fields.properties.importedAt = batch.at;
  fields.properties.importedBatch = batch.id;
  fields.tagIds = [...tagIds];

  return fields;
}

function isoOrUndefined(value: string): string | undefined {
  const parsed = Date.parse(value.replace(/[[\]]/g, "").replace(/(\d{1,2})(st|nd|rd|th)\b/gi, "$1"));
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

/** `pages/Books/Sapiens.md` → `Books`; nothing for a page at the vault root. */
function folderNameOf(path: string): string | null {
  const segments = path.split("/").slice(0, -1);
  const last = segments[segments.length - 1];
  return last && last.toLowerCase() !== "pages" ? last : null;
}

/**
 * One block holding the `[[links]]` a tag mapping asked for — roughly where the
 * property line sat in Logseq, and enough to make the edges real.
 */
function linkBlock(labels: readonly string[]): JSONContent {
  const text = labels.map((label) => `[[${label}]]`).join(" ");
  return {
    type: BLOCK_NODE_TYPE,
    attrs: { blockId: null, blockType: DEFAULT_BLOCK_TYPE },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

// --- Images ------------------------------------------------------------------

/**
 * Cache each image's bytes against the block that owns it, and point the node at
 * the id it will have. The rows follow once the blocks are written.
 *
 * Two sources, both worth taking: a file from the picked folder, and — when
 * `downloadRemote` is on — an image that lives at a URL, fetched through the
 * server proxy. A vault's images are often mostly remote, and left hotlinked they
 * need the network on every read and die when the source moves; they'd otherwise
 * only be pulled in page by page as each is opened.
 *
 * Anything that can't be resolved or fetched keeps its `src`, which still renders
 * and leaves the editor's adopt pass free to try again later. A downloaded image
 * keeps its `src` too, so the original URL survives in a markdown export.
 */
async function storeImageBytes(
  blockNodes: readonly JSONContent[],
  fromPath: string,
  assets: AssetIndex,
  stored: StoredBytes[],
  downloadRemote: boolean,
): Promise<void> {
  for (const { node, blockId } of collectImageNodes(blockNodes)) {
    const src = imageSrcOf(node);
    if (!src || !blockId || node.attrs?.attachmentId) continue;

    if (isExternalRef(src)) {
      if (!downloadRemote || !/^https?:\/\//i.test(src)) continue;
      const blob = await fetchRemoteImage(src);
      if (!blob) continue;
      const attachment = await storeFileBytes(blob, { blockId }, {
        fileName: imageFileNameFromUrl(src),
        mimeType: blob.type,
      });
      stored.push(attachment);
      node.attrs = { ...node.attrs, attachmentId: attachment.id };
      continue;
    }

    const file = resolveAssetRef(src, fromPath, assets);
    if (!file) continue;
    const attachment = await storeFileBytes(file, { blockId }, { fileName: file.name, mimeType: file.type });
    stored.push(attachment);
    // A local path is meaningless once imported, so it goes.
    node.attrs = { ...node.attrs, attachmentId: attachment.id, src: null };
  }
}

/**
 * A `banner::` image becomes the page's banner — a page-owned attachment whose id
 * the page records in `properties.banner`.
 *
 * Returns the cached bytes, or null when the reference resolves to nothing: a
 * vault can name an asset it no longer holds, and a remote banner needs the same
 * proxy an inline image does.
 */
async function storeBannerBytes(
  ref: string,
  fromPath: string,
  assets: AssetIndex,
  pageId: string,
  downloadRemote: boolean,
): Promise<StoredBytes | null> {
  if (isExternalRef(ref)) {
    if (!downloadRemote || !/^https?:\/\//i.test(ref)) return null;
    const blob = await fetchRemoteImage(ref);
    if (!blob) return null;
    return storeFileBytes(blob, { pageId }, { fileName: imageFileNameFromUrl(ref), mimeType: blob.type });
  }

  const file = resolveAssetRef(ref, fromPath, assets);
  if (!file) return null;
  return storeFileBytes(file, { pageId }, { fileName: file.name, mimeType: file.type });
}

// --- Pass two: resolve links now that every page exists ----------------------

/**
 * Re-reconcile every imported block against a title index built once.
 *
 * `reconcileEntityRefs` reads all page titles per call, so doing this without the
 * shared index would scan the table once per block.
 */
async function resolveImportedLinks(pageIds: readonly string[]): Promise<void> {
  const titleIndex = await buildTitleIndex();

  for (let offset = 0; offset < pageIds.length; offset += RECONCILE_BATCH) {
    const batch = pageIds.slice(offset, offset + RECONCILE_BATCH);
    const placeholders = batch.map(() => "?").join(", ");
    const blocks = await db.getAll<{ id: string; content: string | null }>(
      `SELECT id, content FROM blocks WHERE page_id IN (${placeholders})`,
      batch,
    );

    for (const block of blocks) {
      if (!block.content) continue;
      try {
        await reconcileNoteBlockEdges(block.id, JSON.parse(block.content) as JsonValue, undefined, titleIndex);
      } catch {
        // A link that won't resolve isn't worth failing an import over.
      }
    }
    await yieldToUI();
  }
}

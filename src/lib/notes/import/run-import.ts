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
import { attachFile, deleteAttachment } from "@/lib/storage/attachments";
import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";
import { yieldToUI } from "@/lib/shared/utils";
import type { JsonValue } from "@/lib/shared/types";

import { collectImageNodes, imageSrcOf, isExternalRef, resolveAssetRef, type AssetIndex } from "./asset-index";
import { normalizeLogseqMarkdown } from "./logseq-normalize";
import { propertyKeyId, splitPropertyList } from "./page-properties";
import { propertyValueFor, type PropertyAction } from "./property-mapping";
import { normalizeTitleKey } from "@/lib/links/tokens";
import type { TagDecision } from "./tag-mapping";
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

type StoredFile = { id: string; file_path: string | null };

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

  const stored: StoredFile[] = [];
  try {
    await attachImages(blockNodes, entry.path, assets, stored, mapping.downloadRemoteImages);
    if (fields.banner) await attachBanner(fields.banner, entry.path, assets, pageId, stored);

    return await createNotePageFromBlockNodes({
      id: pageId,
      title,
      blockNodes,
      properties: fields.properties,
      tagIds: fields.tagIds,
      createdAt: fields.createdAt,
      updatedAt: fields.updatedAt,
    });
  } catch (error) {
    // The page never landed, so nothing references these files — and nothing
    // would ever reclaim them: the cascade needs a block row and the orphan sweep
    // only removes objects whose row is gone.
    await Promise.all(stored.map((file) => deleteAttachment(file).catch(() => {})));
    throw error;
  }
}

// --- Properties → page fields ------------------------------------------------

interface PageFields {
  title: string;
  properties: Record<string, JsonValue>;
  tagIds: string[];
  /** Values the mapping asked to render as `[[links]]`. */
  links: string[];
  banner: string | null;
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
      }
      continue;
    }

    const definitionId =
      action.kind === "existing" ? action.definitionId : mapping.definitionIds.get(action.name.trim().toLowerCase());
    if (!definitionId) {
      leftovers[key] = value;
      continue;
    }
    const type = action.kind === "existing" ? "text" : action.type;
    const resolved = propertyValueFor(type, value);
    if (resolved !== null) custom[definitionId] = resolved as JsonValue;
  }

  // Inline hashtags only count when the mapping opted them in.
  for (const hashtag of entry.hashtags) applyTagValue(hashtag);

  if (mapping.tagFolders) {
    const folder = folderNameOf(entry.path);
    const id = folder ? mapping.tagIds.get(folder.toLowerCase()) : undefined;
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
 * Store each image against the block that owns it and point the node at it.
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
async function attachImages(
  blockNodes: readonly JSONContent[],
  fromPath: string,
  assets: AssetIndex,
  stored: StoredFile[],
  downloadRemote: boolean,
): Promise<void> {
  for (const { node, blockId } of collectImageNodes(blockNodes)) {
    const src = imageSrcOf(node);
    if (!src || !blockId || node.attrs?.attachmentId) continue;

    if (isExternalRef(src)) {
      if (!downloadRemote || !/^https?:\/\//i.test(src)) continue;
      const blob = await fetchRemoteImage(src);
      if (!blob) continue;
      const attachment = await attachFile(blob, { blockId }, {
        fileName: imageFileNameFromUrl(src),
        mimeType: blob.type,
      });
      stored.push(attachment);
      node.attrs = { ...node.attrs, attachmentId: attachment.id };
      continue;
    }

    const file = resolveAssetRef(src, fromPath, assets);
    if (!file) continue;
    const attachment = await attachFile(file, { blockId }, { fileName: file.name, mimeType: file.type });
    stored.push(attachment);
    // A local path is meaningless once imported, so it goes.
    node.attrs = { ...node.attrs, attachmentId: attachment.id, src: null };
  }
}

/** A `banner::` image becomes a page attachment — it has no other home here. */
async function attachBanner(
  ref: string,
  fromPath: string,
  assets: AssetIndex,
  pageId: string,
  stored: StoredFile[],
): Promise<void> {
  const file = resolveAssetRef(ref, fromPath, assets);
  if (!file) return;
  stored.push(await attachFile(file, { pageId }, { fileName: file.name, mimeType: file.type }));
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

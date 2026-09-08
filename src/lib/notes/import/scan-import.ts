/**
 * The dry run behind the import picker.
 *
 * Every file is actually read, normalized and parsed before anything is shown, so
 * the status next to a file is a fact rather than a guess from its extension. The
 * cost is one extra parse; the alternative is telling someone a file is fine and
 * failing halfway through the import.
 *
 * Only the verdict is kept — status, title, counts. Holding every parsed document
 * would balloon memory on a large vault, and re-parsing at write time is the cheap
 * half of the work.
 */

import { markdownToBlockNodes } from "@/lib/notes/editor/markdown-paste";
import { yieldToUI } from "@/lib/shared/utils";

import { buildAssetIndex, collectImageNodes, imageSrcOf, relativePathOf, resolveAssetRef, type AssetIndex } from "./asset-index";
import { normalizeLogseqMarkdown, type LogseqNote } from "./logseq-normalize";
import { isMarkdownFile } from "./pick-markdown-files";
import { titleFromVaultPath } from "./title-allocator";

/** How often to hand the main thread back while scanning. */
const YIELD_EVERY = 15;

export type ScanStatus =
  /** Parses, not seen before — import it. */
  | "ready"
  /** A `journals/` file: out of scope by default, but tickable. */
  | "journal"
  /** A page whose source path was imported before. */
  | "already"
  /** Not a markdown file (an asset, a config). */
  | "notMarkdown"
  /** Markdown with nothing in it. */
  | "empty"
  /** Couldn't be read or parsed. */
  | "failed";

export interface ScannedFile {
  file: File;
  /** Vault-relative path, e.g. `pages/Books/Sapiens.md`. */
  path: string;
  /** The title it would get, before collision handling. */
  title: string;
  status: ScanStatus;
  /** Why it's skipped, or what needs a look — shown beside the status. */
  detail: string;
  notes: LogseqNote[];
  embedsLinked: number;
  blockCount: number;
  /** Images that live at a URL — downloadable, but only if asked. */
  remoteImages: number;
  /** Images that resolve to a file in the picked folder. */
  localImages: number;
  properties: Array<{ key: string; value: string }>;
  hashtags: string[];
  /** Ticked by default: ready files only. */
  selected: boolean;
}

export interface VaultScan {
  files: ScannedFile[];
  /** Every picked file by path, so image references can be resolved later. */
  assets: AssetIndex;
}

export interface ScanContext {
  /** Source paths already imported, from `properties.importedFrom`. */
  alreadyImported: ReadonlySet<string>;
}

/** `journals/2022_12_28.md` → `2022-12-28`; Logseq writes the day with underscores. */
function journalTitle(path: string): string {
  const base = path.split("/").pop() ?? path;
  const name = base.replace(/\.(md|markdown)$/i, "");
  return /^\d{4}_\d{2}_\d{2}$/.test(name) ? name.replace(/_/g, "-") : titleFromVaultPath(path);
}

const isJournal = (path: string) => /(^|\/)journals\//i.test(path);

export async function scanVaultFiles(
  files: readonly File[],
  context: ScanContext,
  onProgress?: (done: number, total: number) => void,
): Promise<VaultScan> {
  const assets = buildAssetIndex(files);
  const scanned: ScannedFile[] = [];

  for (const [index, file] of files.entries()) {
    scanned.push(await scanOne(file, context, assets));
    onProgress?.(index + 1, files.length);
    if ((index + 1) % YIELD_EVERY === 0) await yieldToUI();
  }

  scanned.sort((a, b) => a.path.localeCompare(b.path));
  return { files: scanned, assets };
}

async function scanOne(file: File, context: ScanContext, assets: AssetIndex): Promise<ScannedFile> {
  const path = relativePathOf(file);
  const base = {
    file,
    path,
    notes: [] as LogseqNote[],
    embedsLinked: 0,
    blockCount: 0,
    remoteImages: 0,
    localImages: 0,
    properties: [] as Array<{ key: string; value: string }>,
    hashtags: [] as string[],
  };

  if (!isMarkdownFile(file)) {
    return { ...base, title: "", status: "notMarkdown", detail: "not markdown", selected: false };
  }

  const journal = isJournal(path);
  const title = journal ? journalTitle(path) : titleFromVaultPath(path);

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ...base, title, status: "failed", detail: "unreadable", selected: false };
  }

  let normalized;
  let blockCount: number;
  let remoteImages = 0;
  let localImages = 0;
  try {
    normalized = normalizeLogseqMarkdown(text);
    const nodes = markdownToBlockNodes(normalized.body);
    blockCount = nodes.length;
    for (const { node } of collectImageNodes(nodes)) {
      const src = imageSrcOf(node);
      if (!src) continue;
      if (/^https?:\/\//i.test(src)) remoteImages += 1;
      else if (resolveAssetRef(src, path, assets)) localImages += 1;
    }
  } catch {
    return { ...base, title, status: "failed", detail: "couldn't be parsed", selected: false };
  }

  const parsed = {
    ...base,
    title,
    notes: normalized.notes,
    embedsLinked: normalized.embedsLinked,
    properties: normalized.properties,
    hashtags: normalized.hashtags,
    blockCount,
    remoteImages,
    localImages,
  };

  if (context.alreadyImported.has(path)) {
    return { ...parsed, status: "already", detail: "already imported", selected: false };
  }
  if (journal) {
    return { ...parsed, status: "journal", detail: "journal", selected: false };
  }
  if (blockCount === 0 && normalized.properties.length === 0) {
    return { ...parsed, status: "empty", detail: "empty", selected: false };
  }

  return { ...parsed, status: "ready", detail: "", selected: true };
}

/** Files the user has ticked, in vault order. */
export function selectedFiles(scan: VaultScan, selection: ReadonlySet<string>): ScannedFile[] {
  return scan.files.filter((entry) => selection.has(entry.path));
}

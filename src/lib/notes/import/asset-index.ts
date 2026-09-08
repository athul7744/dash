import type { JSONContent } from "@tiptap/core";

import { BLOCK_NODE_TYPE } from "@/lib/notes/editor/block-document";

/**
 * Finding the file a markdown image reference points at.
 *
 * A folder pick hands over every file with its `webkitRelativePath`, so a
 * reference like `../assets/photo.jpg` can be matched to real bytes and stored as
 * an attachment. Logseq always writes asset paths relative to `pages/`, which is
 * wrong for a page that lives in a subdirectory — so resolution falls back from
 * the literal path, to vault-root, to a unique basename.
 */

/** The file's path within the picked folder; a plain file pick has only a name. */
export function relativePathOf(file: File): string {
  const withPath = file as File & { webkitRelativePath?: string };
  const path = withPath.webkitRelativePath || file.name;
  // A folder pick prefixes the chosen folder's own name; drop it so paths read
  // from the vault root, which is what references are written against.
  const segments = path.split("/");
  return segments.length > 1 ? segments.slice(1).join("/") : path;
}

export interface AssetIndex {
  byPath: Map<string, File>;
  /** Only names that appear exactly once — an ambiguous basename resolves to nothing. */
  byUniqueName: Map<string, File>;
}

export function buildAssetIndex(files: readonly File[]): AssetIndex {
  const byPath = new Map<string, File>();
  const nameCounts = new Map<string, number>();

  for (const file of files) {
    const path = relativePathOf(file).toLowerCase();
    if (!byPath.has(path)) byPath.set(path, file);
    const name = (path.split("/").pop() ?? path).toLowerCase();
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  const byUniqueName = new Map<string, File>();
  for (const [path, file] of byPath) {
    const name = path.split("/").pop() ?? path;
    if (nameCounts.get(name) === 1) byUniqueName.set(name, file);
  }

  return { byPath, byUniqueName };
}

/** Whether a reference points somewhere else entirely and should be left alone. */
export function isExternalRef(ref: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref.trim());
}

/** Collapse `.` and `..` segments against the directory holding `fromPath`. */
function resolveSegments(ref: string, fromPath: string): string {
  const base = fromPath.split("/").slice(0, -1);
  const out = [...base];
  for (const segment of ref.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join("/");
}

/**
 * The file a reference means, or null when the picked set doesn't contain it.
 * `fromPath` is the markdown file's own vault-relative path.
 */
export function resolveAssetRef(ref: string, fromPath: string, index: AssetIndex): File | null {
  const trimmed = ref.trim();
  if (!trimmed || isExternalRef(trimmed)) return null;

  let decoded = trimmed.split("#")[0].split("?")[0];
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Leave a stray % alone.
  }

  const candidates = [resolveSegments(decoded, fromPath), decoded.replace(/^\.?\//, "")];
  for (const candidate of candidates) {
    const hit = index.byPath.get(candidate.toLowerCase());
    if (hit) return hit;
  }

  const name = decoded.split("/").pop();
  return name ? index.byUniqueName.get(name.toLowerCase()) ?? null : null;
}

/**
 * Every image node in a block document, with the id of the block that owns it.
 *
 * The owner matters: an image's file is stored against its block, so that block's
 * delete cascade is what reclaims it.
 */
export function collectImageNodes(nodes: readonly JSONContent[]): Array<{ node: JSONContent; blockId: string }> {
  const found: Array<{ node: JSONContent; blockId: string }> = [];

  const walk = (list: readonly JSONContent[], blockId: string) => {
    for (const node of list) {
      const owner =
        node.type === BLOCK_NODE_TYPE && typeof node.attrs?.blockId === "string" ? node.attrs.blockId : blockId;
      if (node.type === "image") found.push({ node, blockId: owner });
      if (Array.isArray(node.content)) walk(node.content, owner);
    }
  };

  walk(nodes, "");
  return found;
}

/** An image node's `src`, or "" when it has none. */
export function imageSrcOf(node: JSONContent): string {
  return typeof node.attrs?.src === "string" ? node.attrs.src : "";
}

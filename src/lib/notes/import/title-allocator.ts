/**
 * Turning vault filenames into unique page titles.
 *
 * Page titles are globally unique here, and `createNotePage` enforces that with a
 * full table scan per call that *throws* on a collision — unusable for a whole
 * vault. So the import prefetches every existing title once and allocates against
 * that set in memory, which also settles collisions between two files in the same
 * batch.
 */

import { normalizeNotePageTitle } from "@/lib/notes/notes-content";
import { normalizeTitleKey } from "@/lib/links/tokens";

/**
 * A vault filename → the page title it means.
 *
 * Logseq encodes a namespaced page two ways: `Project___Ideas.md` (the
 * `:triple-lowbar` format) and, in older vaults, a real subdirectory. It also
 * percent-encodes characters it can't put in a filename, so
 * `Bitcoin %3A BerkeleyX.md` is really `Bitcoin : BerkeleyX`.
 *
 * The **basename** becomes the title, not the path: a Logseq `[[link]]` targets the
 * basename, and the title is the key link resolution matches on.
 */
export function titleFromVaultPath(relativePath: string): string {
  const base = relativePath.split(/[\/\\]/).pop() ?? relativePath;
  const withoutExt = base.replace(/\.(md|markdown)$/i, "");
  let decoded = withoutExt;
  try {
    decoded = decodeURIComponent(withoutExt);
  } catch {
    // A stray % that isn't an escape — keep the raw name.
  }
  return normalizeNotePageTitle(decoded.replace(/___/g, "/"));
}

export interface TitleAllocator {
  /** Claim a unique title based on `base`, remembering it for later calls. */
  allocate(base: string): string;
  /** Whether a title is already taken (existing page or earlier allocation). */
  isTaken(title: string): boolean;
}

/**
 * Allocate unique titles against `existingTitles`.
 *
 * Mirrors the suffix rule `createNoteFromText` uses so imported and captured
 * pages collide the same way: `base`, `base (2)`…`base (5)`, then a short random
 * suffix as a last resort.
 */
export function createTitleAllocator(existingTitles: Iterable<string>): TitleAllocator {
  const taken = new Set<string>();
  for (const title of existingTitles) {
    const key = normalizeTitleKey(title);
    if (key) taken.add(key);
  }

  const isTaken = (title: string) => taken.has(normalizeTitleKey(title));

  return {
    isTaken,
    allocate(base: string): string {
      const normalized = normalizeNotePageTitle(base) || "Untitled";
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const candidate = attempt === 1 ? normalized : `${normalized} (${attempt})`;
        if (!isTaken(candidate)) {
          taken.add(normalizeTitleKey(candidate));
          return candidate;
        }
      }
      let candidate = `${normalized} ${randomSuffix()}`;
      while (isTaken(candidate)) candidate = `${normalized} ${randomSuffix()}`;
      taken.add(normalizeTitleKey(candidate));
      return candidate;
    },
  };
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 8);
}

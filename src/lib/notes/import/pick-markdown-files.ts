/**
 * Getting vault files from the user.
 *
 * A folder pick is the useful one: it hands over every file with its
 * `webkitRelativePath`, which is what lets an image reference inside a note find
 * the actual asset. A plain multi-file pick works too, without assets.
 */

const MARKDOWN_ACCEPT = ".md,.markdown,text/markdown";

export function isMarkdownFile(file: File): boolean {
  return /\.(md|markdown)$/i.test(file.name);
}

/**
 * Open the OS picker and resolve the chosen files (empty if dismissed).
 *
 * A transient input, so it doesn't depend on where in a component tree the caller
 * renders — the same approach the editor's image picker uses.
 */
export function pickVaultFiles({ folder = false }: { folder?: boolean } = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (folder) {
      // Not in the TS DOM lib; both attribute spellings are needed in practice.
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    } else {
      input.accept = MARKDOWN_ACCEPT;
    }
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** Markdown files on a drag payload, for dropping a note into the editor. */
export function markdownFilesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data?.files?.length) return [];
  return Array.from(data.files).filter(isMarkdownFile);
}

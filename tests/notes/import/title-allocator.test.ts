/// <reference types="vitest/globals" />

/**
 * Filenames → unique page titles.
 *
 * Titles are globally unique and the normal create path *throws* on a collision,
 * so the import has to settle every clash up front — including two files in the
 * same batch that want the same title.
 */

import { createTitleAllocator, titleFromVaultPath } from "@/lib/notes/import/title-allocator";

describe("titleFromVaultPath", () => {
  it("takes the basename, not the path", () => {
    // A Logseq [[link]] targets the basename, and the title is the key link
    // resolution matches on — so a path-shaped title would break every link.
    expect(titleFromVaultPath("pages/Books/Sapiens.md")).toBe("Sapiens");
    expect(titleFromVaultPath("pages/Ideas/Roam Offline.md")).toBe("Roam Offline");
    expect(titleFromVaultPath("pages/Ideas.md")).toBe("Ideas");
  });

  it("decodes what Logseq escaped in the filename", () => {
    expect(titleFromVaultPath("pages/Bitcoin and Cryptocurrencies %3A BerkeleyX CS198.1x.md")).toBe(
      "Bitcoin and Cryptocurrencies : BerkeleyX CS198.1x",
    );
    expect(titleFromVaultPath("pages/Project___Ideas.md")).toBe("Project/Ideas");
  });

  it("survives a stray percent that isn't an escape", () => {
    expect(titleFromVaultPath("pages/100% done.md")).toBe("100% done");
  });

  it("handles windows separators and the .markdown extension", () => {
    expect(titleFromVaultPath("pages\\Books\\On Writing.markdown")).toBe("On Writing");
  });

  it("collapses whitespace", () => {
    expect(titleFromVaultPath("pages/Too   many   spaces.md")).toBe("Too many spaces");
  });
});

describe("createTitleAllocator", () => {
  it("keeps a free title as-is", () => {
    expect(createTitleAllocator([]).allocate("Sapiens")).toBe("Sapiens");
  });

  it("suffixes around an existing page, case-insensitively", () => {
    const allocator = createTitleAllocator(["sapiens"]);
    expect(allocator.allocate("Sapiens")).toBe("Sapiens (2)");
  });

  it("settles a collision between two files in the same batch", () => {
    const allocator = createTitleAllocator([]);
    expect(allocator.allocate("Ideas")).toBe("Ideas");
    expect(allocator.allocate("Ideas")).toBe("Ideas (2)");
    expect(allocator.allocate("Ideas")).toBe("Ideas (3)");
  });

  it("falls back to a random suffix once the numbered ones are gone", () => {
    const allocator = createTitleAllocator(["Home", "Home (2)", "Home (3)", "Home (4)", "Home (5)"]);
    const title = allocator.allocate("Home");
    expect(title).toMatch(/^Home [0-9a-f]{6}$/);
  });

  it("reports what is taken, including its own allocations", () => {
    const allocator = createTitleAllocator(["Home"]);
    expect(allocator.isTaken("home")).toBe(true);
    expect(allocator.isTaken("Ideas")).toBe(false);
    allocator.allocate("Ideas");
    expect(allocator.isTaken("Ideas")).toBe(true);
  });

  it("falls back to Untitled for an empty name", () => {
    expect(createTitleAllocator([]).allocate("   ")).toBe("Untitled");
  });
});

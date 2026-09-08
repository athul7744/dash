/// <reference types="vitest/globals" />

/**
 * Writing a scanned vault.
 *
 * The invariants here all fail silently if broken: a page hidden from search
 * because `properties.kind` slipped in, blocks dropped because their ids were
 * empty, a stored image nothing references, or one bad file taking the rest of the
 * import down with it.
 */

const {
  execute,
  getAll,
  writeTransaction,
  attachFile,
  deleteAttachment,
  setEntityTags,
  reconcileEntityRefs,
  fetchRemoteImage,
} = vi.hoisted(() => ({
  execute: vi.fn(),
  getAll: vi.fn(),
  writeTransaction: vi.fn(),
  attachFile: vi.fn(),
  deleteAttachment: vi.fn(),
  setEntityTags: vi.fn(),
  reconcileEntityRefs: vi.fn(),
  fetchRemoteImage: vi.fn(),
}));

vi.mock("@/lib/powersync/db", () => ({ db: { execute, getAll, writeTransaction } }));
vi.mock("@/lib/shared/auth", () => ({ getCurrentUserId: vi.fn(() => Promise.resolve("user-1")) }));
vi.mock("@/lib/storage/attachments", () => ({ attachFile, deleteAttachment }));
vi.mock("@/lib/storage/remote-image", () => ({
  fetchRemoteImage,
  imageFileNameFromUrl: (url: string) => url.split("/").pop() ?? "image",
}));
vi.mock("@/lib/tags/entity-tags", () => ({ setEntityTags }));
vi.mock("@/lib/links/links", () => ({
  reconcileEntityRefs,
  buildTitleIndex: vi.fn(() => Promise.resolve(new Map())),
  REF_TYPE_SQL: "1 = 1",
}));

import { runMarkdownImport, type ImportMapping } from "@/lib/notes/import/run-import";
import { buildAssetIndex } from "@/lib/notes/import/asset-index";
import type { ScannedFile } from "@/lib/notes/import/scan-import";

/** A statement run inside a transaction, with its params. */
type Statement = { sql: string; params: unknown[] };
let statements: Statement[][] = [];

function vaultFile(path: string, text: string, type = "text/markdown"): File {
  const file = new File([text], path.split("/").pop() ?? path, { type });
  Object.defineProperty(file, "webkitRelativePath", { value: `Vault/${path}` });
  return file;
}

function scanned(path: string, text: string, over: Partial<ScannedFile> = {}): ScannedFile {
  return {
    file: vaultFile(path, text),
    path,
    title: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
    status: "ready",
    detail: "",
    notes: [],
    embedsLinked: 0,
    blockCount: 1,
    remoteImages: 0,
    localImages: 0,
    properties: [],
    hashtags: [],
    selected: true,
    ...over,
  };
}

function mapping(over: Partial<ImportMapping> = {}): ImportMapping {
  return {
    properties: new Map(),
    definitionIds: new Map(),
    tags: new Map(),
    tagIds: new Map(),
    tagFolders: false,
    downloadRemoteImages: false,
    ...over,
  };
}

/** Every statement from every transaction, flattened. */
const allStatements = () => statements.flat();
const inserts = (table: string) => allStatements().filter((s) => s.sql.includes(`INSERT INTO ${table}`));

beforeEach(() => {
  statements = [];
  execute.mockReset();
  getAll.mockReset();
  writeTransaction.mockReset();
  attachFile.mockReset();
  deleteAttachment.mockReset();
  setEntityTags.mockReset();
  reconcileEntityRefs.mockReset();
  fetchRemoteImage.mockReset();

  getAll.mockResolvedValue([]);
  deleteAttachment.mockResolvedValue(undefined);
  setEntityTags.mockResolvedValue(undefined);
  reconcileEntityRefs.mockResolvedValue(undefined);
  let n = 0;
  attachFile.mockImplementation(() => {
    n += 1;
    return Promise.resolve({ id: `att-${n}`, file_path: `p/att-${n}.png` });
  });
  writeTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const captured: Statement[] = [];
    statements.push(captured);
    await fn({
      execute: (sql: string, params: unknown[] = []) => {
        captured.push({ sql, params });
        return Promise.resolve();
      },
      getAll: () => Promise.resolve([]),
    });
  });
});

describe("runMarkdownImport", () => {
  it("writes one transaction per file", async () => {
    const files = [scanned("pages/A.md", "- one"), scanned("pages/B.md", "- two")];

    const result = await runMarkdownImport(files, buildAssetIndex([]), mapping(), { existingTitles: [] });

    expect(result.pageIds).toHaveLength(2);
    expect(result.failures).toEqual([]);
    expect(writeTransaction).toHaveBeenCalledTimes(2);
  });

  it("keeps the files that worked when one fails", async () => {
    // A vault is not worth abandoning over a single unreadable file.
    const bad = scanned("pages/B.md", "");
    bad.file = { name: "B.md", text: () => Promise.reject(new Error("unreadable")) } as unknown as File;
    const files = [scanned("pages/A.md", "- one"), bad, scanned("pages/C.md", "- three")];

    const result = await runMarkdownImport(files, buildAssetIndex([]), mapping(), { existingTitles: [] });

    expect(result.pageIds).toHaveLength(2);
    expect(result.failures).toEqual([{ path: "pages/B.md", message: "unreadable" }]);
  });

  it("gives every block a real id and keeps document order", async () => {
    await runMarkdownImport([scanned("pages/A.md", "- one\n- two\n- three")], buildAssetIndex([]), mapping(), {
      existingTitles: [],
    });

    const rows = inserts("blocks");
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.params[0]).toMatch(/^[0-9a-f-]{36}$/);
    const ranks = rows.map((row) => String(row.params[6]));
    expect([...ranks].sort()).toEqual(ranks);
  });

  it("nests a child block under its parent", async () => {
    await runMarkdownImport([scanned("pages/A.md", "- parent\n\t- child")], buildAssetIndex([]), mapping(), {
      existingTitles: [],
    });

    const rows = inserts("blocks");
    expect(rows).toHaveLength(2);
    const [parent, child] = rows;
    expect(parent.params[3]).toBeNull();
    expect(child.params[3]).toBe(parent.params[0]);
  });

  it("never marks an imported page as a system page", async () => {
    // A `kind` would hide it from /notes, search, the graph and trash.
    await runMarkdownImport([scanned("pages/A.md", "- one")], buildAssetIndex([]), mapping(), { existingTitles: [] });

    const page = inserts("pages")[0];
    const properties = JSON.parse(String(page.params[3]));
    expect(properties.kind).toBeUndefined();
    expect(properties.importedFrom).toBe("pages/A.md");
    expect(properties.importedAt).toEqual(expect.any(String));
  });

  it("stamps one batch id on every page so the import can be undone later", async () => {
    // Per-file timestamps differ by milliseconds, which is no use for finding
    // "the last import" once the dialog has closed.
    const files = [scanned("pages/A.md", "- one"), scanned("pages/B.md", "- two")];

    const result = await runMarkdownImport(files, buildAssetIndex([]), mapping(), { existingTitles: [] });

    const batches = inserts("pages").map((row) => JSON.parse(String(row.params[3])));
    expect(new Set(batches.map((p) => p.importedBatch)).size).toBe(1);
    expect(new Set(batches.map((p) => p.importedAt)).size).toBe(1);
    expect(batches[0].importedBatch).toBe(result.batchId);
  });

  it("allocates around an existing title", async () => {
    await runMarkdownImport([scanned("pages/Ideas.md", "- one")], buildAssetIndex([]), mapping(), {
      existingTitles: ["Ideas"],
    });
    expect(inserts("pages")[0].params[2]).toBe("Ideas (2)");
  });

  it("resolves links only after every page exists", async () => {
    // Reconciling per file would drop a link to a page imported later.
    const files = [scanned("pages/A.md", "- see [[B]]"), scanned("pages/B.md", "- hello")];

    await runMarkdownImport(files, buildAssetIndex([]), mapping(), { existingTitles: [] });

    getAll.mockResolvedValue([]);
    // The second pass reads the imported pages' blocks back.
    expect(getAll).toHaveBeenCalledWith(expect.stringContaining("FROM blocks WHERE page_id IN"), expect.any(Array));
  });
});

describe("images", () => {
  const png = () => {
    const file = new File([new Uint8Array(4)], "photo.png", { type: "image/png" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Vault/assets/photo.png" });
    return file;
  };

  it("stores a resolvable image against its own block and points the node at it", async () => {
    const assets = buildAssetIndex([png()]);

    await runMarkdownImport([scanned("pages/A.md", "- ![](../assets/photo.png)")], assets, mapping(), {
      existingTitles: [],
    });

    expect(attachFile).toHaveBeenCalledTimes(1);
    const [, target] = attachFile.mock.calls[0];
    const blockRow = inserts("blocks").find((row) => String(row.params[5]).includes("attachmentId"));
    expect(blockRow?.params[0]).toBe((target as { blockId: string }).blockId);
    expect(String(blockRow?.params[5])).not.toContain('"src"');
  });

  it("leaves a reference it can't resolve as-is", async () => {
    await runMarkdownImport([scanned("pages/A.md", "- ![](../assets/missing.png)")], buildAssetIndex([]), mapping(), {
      existingTitles: [],
    });
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("leaves a remote image alone when downloading is off", async () => {
    // Then it stays hotlinked, and the editor's adopt pass can take it later.
    await runMarkdownImport(
      [scanned("pages/A.md", "- ![](https://example.com/x.png)")],
      buildAssetIndex([png()]),
      mapping({ downloadRemoteImages: false }),
      { existingTitles: [] },
    );
    expect(fetchRemoteImage).not.toHaveBeenCalled();
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("downloads a remote image when asked, keeping the original url", async () => {
    // Most of a real vault's images live at a URL. Left hotlinked they need the
    // network on every read and are only pulled in page by page as each is opened.
    fetchRemoteImage.mockResolvedValue(new Blob([new Uint8Array(4)], { type: "image/png" }));

    await runMarkdownImport(
      [scanned("pages/A.md", "- ![](https://example.com/x.png)")],
      buildAssetIndex([]),
      mapping({ downloadRemoteImages: true }),
      { existingTitles: [] },
    );

    expect(fetchRemoteImage).toHaveBeenCalledWith("https://example.com/x.png");
    expect(attachFile).toHaveBeenCalledTimes(1);
    const content = String(inserts("blocks")[0].params[5]);
    expect(content).toContain("attachmentId");
    // The url survives, so a markdown export still points at the source.
    expect(content).toContain("https://example.com/x.png");
  });

  it("keeps the hotlink when the download fails", async () => {
    fetchRemoteImage.mockResolvedValue(null);

    const result = await runMarkdownImport(
      [scanned("pages/A.md", "- ![](https://example.com/x.png)")],
      buildAssetIndex([]),
      mapping({ downloadRemoteImages: true }),
      { existingTitles: [] },
    );

    expect(result.failures).toEqual([]);
    expect(attachFile).not.toHaveBeenCalled();
    expect(String(inserts("blocks")[0].params[5])).toContain("https://example.com/x.png");
  });

  it("does not download a data: or blob: src", async () => {
    await runMarkdownImport(
      [scanned("pages/A.md", "- ![](data:image/png;base64,AAAA)")],
      buildAssetIndex([]),
      mapping({ downloadRemoteImages: true }),
      { existingTitles: [] },
    );
    expect(fetchRemoteImage).not.toHaveBeenCalled();
  });

  it("discards stored images when the page write fails", async () => {
    // Nothing would reclaim them: the cascade needs a block row, and the orphan
    // sweep only removes objects whose row is gone.
    writeTransaction.mockRejectedValueOnce(new Error("disk full"));

    const result = await runMarkdownImport(
      [scanned("pages/A.md", "- ![](../assets/photo.png)")],
      buildAssetIndex([png()]),
      mapping(),
      { existingTitles: [] },
    );

    expect(result.failures).toHaveLength(1);
    expect(deleteAttachment).toHaveBeenCalledWith({ id: "att-1", file_path: "p/att-1.png" });
  });
});

describe("mapped properties and tags", () => {
  const source = ["tags:: Books To Read, life", "Status:: #Reading", "icon:: 📚", "oddity:: keep me", "", "- body"].join(
    "\n",
  );

  const fullMapping = () =>
    mapping({
      properties: new Map<string, ReturnType<typeof Object>>([
        ["tags", { kind: "builtin", field: "tags" }],
        ["icon", { kind: "builtin", field: "emoji" }],
        ["status", { kind: "create", name: "Status", type: "select", options: ["Reading"] }],
      ]) as ImportMapping["properties"],
      definitionIds: new Map([["status", "def-status"]]),
      tags: new Map([
        ["books to read", { tag: { createName: "Books To Read" }, link: true }],
        ["life", { tag: { existingId: "tag-life" }, link: false }],
      ]),
      tagIds: new Map([["books to read", "tag-books"]]),
    });

  it("applies each mapped field to the page", async () => {
    await runMarkdownImport([scanned("pages/Sapiens.md", source)], buildAssetIndex([]), fullMapping(), {
      existingTitles: [],
    });

    const properties = JSON.parse(String(inserts("pages")[0].params[3]));
    expect(properties.emoji).toBe("📚");
    expect(properties.custom).toEqual({ "def-status": "Reading" });
    // An unmapped key is stored rather than dropped.
    expect(properties.importedFrontmatter).toEqual({ oddity: "keep me" });
  });

  it("tags the page with both the created and the existing tag", async () => {
    await runMarkdownImport([scanned("pages/Sapiens.md", source)], buildAssetIndex([]), fullMapping(), {
      existingTitles: [],
    });

    expect(setEntityTags).toHaveBeenCalledWith(
      expect.any(String),
      "note",
      expect.arrayContaining(["tag-books", "tag-life"]),
      expect.anything(),
    );
  });

  it("adds a link block for a value mapped to a page", async () => {
    await runMarkdownImport([scanned("pages/Sapiens.md", source)], buildAssetIndex([]), fullMapping(), {
      existingTitles: [],
    });

    const first = inserts("blocks")[0];
    expect(String(first.params[5])).toContain("[[Books To Read]]");
  });

  it("takes a title from the mapped title property", async () => {
    await runMarkdownImport(
      [scanned("pages/file-name.md", "title:: Real Title\n\n- body")],
      buildAssetIndex([]),
      mapping({ properties: new Map([["title", { kind: "builtin", field: "title" }]]) }),
      { existingTitles: [] },
    );
    expect(inserts("pages")[0].params[2]).toBe("Real Title");
  });

  it("tags a page with its folder only when asked", async () => {
    const withFolders = mapping({ tagFolders: true, tagIds: new Map([["books", "tag-folder"]]) });
    await runMarkdownImport([scanned("pages/Books/Sapiens.md", "- body")], buildAssetIndex([]), withFolders, {
      existingTitles: [],
    });

    expect(setEntityTags).toHaveBeenCalledWith(expect.any(String), "note", ["tag-folder"], expect.anything());
  });
});

/// <reference types="vitest/globals" />

/**
 * The dry run behind the picker.
 *
 * Every status here is shown to someone deciding what to import, so a wrong one
 * is worse than a crash: it either hides a file they wanted or promises one that
 * won't work. The statuses are computed by really parsing the file, which is what
 * these tests pin.
 */

import { scanVaultFiles } from "@/lib/notes/import/scan-import";

function vaultFile(path: string, text: string, type = "text/markdown"): File {
  const file = new File([text], path.split("/").pop() ?? path, { type });
  // A folder pick prefixes the chosen folder's own name.
  Object.defineProperty(file, "webkitRelativePath", { value: `Vault/${path}` });
  return file;
}

const scan = (files: File[], alreadyImported: string[] = []) =>
  scanVaultFiles(files, { alreadyImported: new Set(alreadyImported) });

describe("scanVaultFiles", () => {
  it("reads a page as ready, with its title and block count", async () => {
    const result = await scan([vaultFile("pages/Books/Sapiens.md", "tags:: life\n\n- one\n- two")]);

    expect(result.files).toHaveLength(1);
    const [file] = result.files;
    expect(file.status).toBe("ready");
    expect(file.title).toBe("Sapiens");
    expect(file.blockCount).toBe(2);
    expect(file.properties).toEqual([{ key: "tags", value: "life" }]);
    expect(file.selected).toBe(true);
  });

  it("leaves a journal unticked but keeps it listed", async () => {
    // Out of scope by default, still tickable — the file list shouldn't lie about
    // what the folder contains.
    const result = await scan([vaultFile("journals/2022_12_28.md", "- Was a fun day")]);

    expect(result.files[0].status).toBe("journal");
    expect(result.files[0].title).toBe("2022-12-28");
    expect(result.files[0].selected).toBe(false);
  });

  it("marks a file whose path was imported before", async () => {
    const result = await scan([vaultFile("pages/Ideas.md", "- one")], ["pages/Ideas.md"]);

    expect(result.files[0].status).toBe("already");
    expect(result.files[0].selected).toBe(false);
  });

  it("counts local and remote images so the cost of downloading is visible", async () => {
    const png = vaultFile("assets/photo.png", "binary", "image/png");
    const page = vaultFile(
      "pages/A.md",
      ["- ![](../assets/photo.png)", "- ![](https://example.com/x.png)", "- ![](../assets/missing.png)"].join("\n"),
    );

    const result = await scan([png, page]);
    const file = result.files.find((entry) => entry.path === "pages/A.md");

    expect(file?.localImages).toBe(1);
    expect(file?.remoteImages).toBe(1);
  });

  it("skips a non-markdown file but indexes it as an asset", async () => {
    const png = vaultFile("assets/photo.png", "binary", "image/png");
    const result = await scan([png, vaultFile("pages/A.md", "- ![](../assets/photo.png)")]);

    const asset = result.files.find((file) => file.path === "assets/photo.png");
    expect(asset?.status).toBe("notMarkdown");
    expect(asset?.selected).toBe(false);
    // Still resolvable, which is the whole point of picking a folder.
    expect(result.assets.byPath.has("assets/photo.png")).toBe(true);
  });

  it("marks a page with nothing in it", async () => {
    expect((await scan([vaultFile("pages/Blank.md", "\n\n")])).files[0].status).toBe("empty");
  });

  it("keeps a properties-only page, which is a real Logseq shape", async () => {
    // A namespace parent page often holds only an icon and a banner.
    const result = await scan([vaultFile("pages/Ideas.md", "banner:: ../assets/x.jpg\nicon:: 💡\n")]);
    expect(result.files[0].status).toBe("ready");
    expect(result.files[0].blockCount).toBe(0);
  });

  it("reports a file it cannot read", async () => {
    const broken = { name: "broken.md", text: () => Promise.reject(new Error("nope")) } as unknown as File;
    const result = await scan([broken]);

    expect(result.files[0].status).toBe("failed");
    expect(result.files[0].detail).toBe("unreadable");
  });

  it("carries the notes that need a second look", async () => {
    const result = await scan([vaultFile("pages/Q.md", "- {{query [[Books]]}}\n- {{embed [[Ideas]]}}")]);

    expect(result.files[0].status).toBe("ready");
    expect(result.files[0].notes).toEqual([{ kind: "query", count: 1 }]);
    expect(result.files[0].embedsLinked).toBe(1);
  });

  it("reports progress once per file and sorts by path", async () => {
    const seen: Array<[number, number]> = [];
    const result = await scanVaultFiles(
      [vaultFile("pages/B.md", "- b"), vaultFile("pages/A.md", "- a")],
      { alreadyImported: new Set() },
      (done, total) => seen.push([done, total]),
    );

    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(result.files.map((file) => file.path)).toEqual(["pages/A.md", "pages/B.md"]);
  });

  it("resolves a page's banner before anything is written", async () => {
    // The real vault holds `banner:: ../assets/x.jpg` on nine pages, one with a
    // trailing space after the filename — so the ref is checked, not assumed.
    const png = vaultFile("assets/cover.png", "binary", "image/png");
    const local = vaultFile("pages/Home.md", ["banner:: ../assets/cover.png ", "banner-align:: 70%", "", "- hi"].join("\n"));
    const remote = vaultFile("pages/Away.md", ["banner:: https://example.com/cover.jpg", "", "- hi"].join("\n"));
    const gone = vaultFile("pages/Gone.md", ["banner:: ../assets/deleted.png", "", "- hi"].join("\n"));
    const none = vaultFile("pages/Plain.md", "- hi");

    const result = await scan([png, local, remote, gone, none]);
    const banners = new Map(result.files.map((file) => [file.path, file.banner]));

    expect(banners.get("pages/Home.md")).toBe("local");
    expect(banners.get("pages/Away.md")).toBe("remote");
    expect(banners.get("pages/Gone.md")).toBe("missing");
    expect(banners.get("pages/Plain.md")).toBeNull();
  });
});

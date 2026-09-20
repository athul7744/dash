/// <reference types="vitest/globals" />

/**
 * Putting a link card into a note.
 *
 * Two things matter here and neither is visible on screen. The write order —
 * block row before attachment row — is what keeps a thumbnail from being refused
 * by the server's foreign key and stranded on one device (see `image-insert.ts`
 * for the full reasoning). And every lookup along the way is allowed to fail:
 * a card made offline, or of a site that blocks the fetch, still has to land.
 */

import type { EditorView } from "@tiptap/pm/view";

import { insertLinkEmbed } from "@/lib/notes/editor/link-embed-insert";
import { LINK_EMBED_NODE_TYPE } from "@/lib/notes/link-embed";

/** Just enough of an inserted block to read the embed's attrs back out. */
type EmbedBlock = { content: { type: string; attrs: Record<string, unknown> }[] };

const { calls, insertBlockNodes, flush, storeFileBytes, insertAttachmentRow, discardStoredBytes, fetchRemoteImage } =
  vi.hoisted(() => {
    const calls: string[] = [];
    return {
      calls,
      insertBlockNodes: vi.fn((_view: unknown, _blocks: EmbedBlock[], _at?: number) => {
        calls.push("insertBlockNodes");
        return true;
      }),
      flush: vi.fn(async () => {
        calls.push("flush");
      }),
      storeFileBytes: vi.fn(async () => {
        calls.push("storeFileBytes");
        return { id: "att-1" };
      }),
      insertAttachmentRow: vi.fn(async () => {
        calls.push("insertAttachmentRow");
      }),
      discardStoredBytes: vi.fn(async () => {
        calls.push("discardStoredBytes");
      }),
      fetchRemoteImage: vi.fn(async () => new Blob(["x"], { type: "image/png" })),
    };
  });

vi.mock("@/lib/notes/editor/markdown-paste", () => ({ insertBlockNodes }));
vi.mock("@/lib/notes/editor/block-persister", () => ({ flushAllBlockDocumentPersisters: flush }));
vi.mock("@/lib/storage/attachments", () => ({ storeFileBytes, insertAttachmentRow, discardStoredBytes }));
vi.mock("@/lib/storage/remote-image", () => ({
  fetchRemoteImage,
  imageFileNameFromUrl: () => "preview.png",
}));
vi.mock("@/lib/storage/paths", () => ({ isAllowed: () => true }));

const view = {} as EditorView;

/** The `linkEmbed` attrs of the block that was inserted. */
const insertedAttrs = () => {
  const node = insertBlockNodes.mock.calls[0][1][0].content[0];
  expect(node.type).toBe(LINK_EMBED_NODE_TYPE);
  return node.attrs;
};

const metadataResponds = (body: unknown, ok = true) => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response));
};

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  insertBlockNodes.mockImplementation(() => {
    calls.push("insertBlockNodes");
    return true;
  });
  metadataResponds({ title: "A Post", description: "About things.", image: "https://cdn.example.com/a.png", host: "example.com" });
});

afterEach(() => vi.unstubAllGlobals());

describe("insertLinkEmbed", () => {
  it("writes the attachment row only after the block row exists", async () => {
    await insertLinkEmbed(view, "https://example.com/post");
    expect(calls).toEqual(["storeFileBytes", "insertBlockNodes", "flush", "insertAttachmentRow"]);
  });

  it("stores what the lookup found", async () => {
    await insertLinkEmbed(view, "https://example.com/post");
    expect(insertedAttrs()).toMatchObject({
      url: "https://example.com/post",
      title: "A Post",
      description: "About things.",
      image: "att-1",
      host: "example.com",
    });
  });

  it("still lands a card when the lookup fails", async () => {
    // Offline, or a site that refuses the fetch. The URL and host are enough.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(insertLinkEmbed(view, "https://www.example.com/post")).resolves.toBe(true);
    expect(insertedAttrs()).toMatchObject({ title: "", image: null, host: "example.com" });
    expect(insertAttachmentRow).not.toHaveBeenCalled();
  });

  it("lands a card with no thumbnail when the image can't be fetched", async () => {
    fetchRemoteImage.mockResolvedValueOnce(null as unknown as Blob);
    await expect(insertLinkEmbed(view, "https://example.com/post")).resolves.toBe(true);
    expect(insertedAttrs().image).toBeNull();
    expect(insertAttachmentRow).not.toHaveBeenCalled();
  });

  it("keeps no orphaned bytes when the block can't be inserted", async () => {
    insertBlockNodes.mockImplementation(() => false);
    const errors: string[] = [];
    await expect(insertLinkEmbed(view, "https://example.com/post", { onError: (m) => errors.push(m) })).resolves.toBe(false);
    expect(discardStoredBytes).toHaveBeenCalledTimes(1);
    expect(insertAttachmentRow).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });

  it("refuses anything that isn't a web address, without touching the network", async () => {
    const errors: string[] = [];
    await expect(insertLinkEmbed(view, "not a url", { onError: (m) => errors.push(m) })).resolves.toBe(false);
    expect(insertBlockNodes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(errors).toHaveLength(1);
  });
});

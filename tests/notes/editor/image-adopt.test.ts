/// <reference types="vitest/globals" />

/**
 * Which images the adopt pass picks up. Getting the selection wrong is the
 * expensive mistake here: re-adopting an image that already has a file would
 * duplicate stored bytes on every pass, and attributing an image to the wrong
 * block would hand its file to a block that can't clean it up.
 */

const { attachFile, deleteAttachment, fetchRemoteImage } = vi.hoisted(() => ({
  attachFile: vi.fn(),
  deleteAttachment: vi.fn(),
  fetchRemoteImage: vi.fn(),
}));

vi.mock("@/lib/storage/attachments", () => ({ attachFile, deleteAttachment }));
vi.mock("@/lib/notes/editor/block-persister", () => ({ flushAllBlockDocumentPersisters: vi.fn() }));
vi.mock("@/lib/storage/remote-image", () => ({
  fetchRemoteImage,
  imageFileNameFromUrl: vi.fn(() => "image.png"),
}));

import type { JSONContent } from "@tiptap/core";

import { adoptImage, findAdoptableImages, isAdoptableSrc } from "@/lib/notes/editor/image-adopt";

function block(blockId: string | null, content: JSONContent[], children: JSONContent[] = []): JSONContent {
  return { type: "block", attrs: { blockId, blockType: "text" }, content: [...content, ...children] };
}

function image(attrs: Record<string, unknown>): JSONContent {
  return { type: "image", attrs };
}

function doc(...blocks: JSONContent[]): JSONContent {
  return { type: "doc", content: blocks };
}

describe("adoptImage", () => {
  const image = { blockId: "b1", src: "https://example.com/a.png" };

  beforeEach(() => {
    attachFile.mockReset();
    deleteAttachment.mockReset();
    fetchRemoteImage.mockReset();
    deleteAttachment.mockResolvedValue(undefined);
    attachFile.mockResolvedValue({ id: "att-1", file_path: "p/att-1.png" });
    fetchRemoteImage.mockResolvedValue(new Blob([new Uint8Array(4)], { type: "image/png" }));
  });

  it("stores the bytes against the image's block and reports the attachment id", async () => {
    const apply = vi.fn(() => true);

    expect(await adoptImage(image, apply)).toBe(true);
    expect(attachFile).toHaveBeenCalledWith(expect.anything(), { blockId: "b1" }, expect.anything());
    expect(apply).toHaveBeenCalledWith("att-1");
    expect(deleteAttachment).not.toHaveBeenCalled();
  });

  it("rolls the file back when the node can't be pointed at it", async () => {
    // Otherwise the image keeps its url, so every later pass stores another copy.
    expect(await adoptImage(image, () => false)).toBe(false);
    expect(deleteAttachment).toHaveBeenCalledWith({ id: "att-1", file_path: "p/att-1.png" });
  });

  it("stores nothing when the download fails", async () => {
    fetchRemoteImage.mockResolvedValue(null);
    const apply = vi.fn();

    expect(await adoptImage(image, apply)).toBe(false);
    expect(attachFile).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("survives a rollback that itself fails", async () => {
    deleteAttachment.mockRejectedValue(new Error("offline"));
    await expect(adoptImage(image, () => false)).resolves.toBe(false);
  });
});

describe("isAdoptableSrc", () => {
  it("accepts remote http(s) urls", () => {
    expect(isAdoptableSrc("https://example.com/a.png")).toBe(true);
    expect(isAdoptableSrc("http://example.com/a.png")).toBe(true);
  });

  it("rejects inline data, session blobs, and non-strings", () => {
    expect(isAdoptableSrc("data:image/png;base64,AAAA")).toBe(false);
    expect(isAdoptableSrc("blob:http://localhost/abc")).toBe(false);
    expect(isAdoptableSrc("/local/a.png")).toBe(false);
    expect(isAdoptableSrc(null)).toBe(false);
    expect(isAdoptableSrc(42)).toBe(false);
  });
});

describe("findAdoptableImages", () => {
  it("pairs a remote image with its owning block", () => {
    const found = findAdoptableImages(doc(block("b1", [image({ src: "https://example.com/a.png" })])));
    expect(found).toEqual([{ blockId: "b1", src: "https://example.com/a.png" }]);
  });

  it("skips images already backed by a file", () => {
    const found = findAdoptableImages(
      doc(block("b1", [image({ src: "https://example.com/a.png", attachmentId: "att-1" })])),
    );
    expect(found).toEqual([]);
  });

  it("skips images with nothing to download", () => {
    const found = findAdoptableImages(
      doc(
        block("b1", [image({ src: "data:image/png;base64,AAAA" })]),
        block("b2", [image({ src: "blob:http://localhost/abc" })]),
        block("b3", [image({ attachmentId: "att-1" })]),
      ),
    );
    expect(found).toEqual([]);
  });

  it("skips a block that hasn't been stamped with an id yet", () => {
    const found = findAdoptableImages(doc(block(null, [image({ src: "https://example.com/a.png" })])));
    expect(found).toEqual([]);
  });

  it("attributes a nested image to its own block, not its parent", () => {
    const found = findAdoptableImages(
      doc(
        block(
          "parent",
          [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }],
          [block("child", [image({ src: "https://example.com/child.png" })])],
        ),
      ),
    );
    expect(found).toEqual([{ blockId: "child", src: "https://example.com/child.png" }]);
  });

  it("finds an image wrapped in a container inside its block", () => {
    const found = findAdoptableImages(
      doc(block("b1", [{ type: "blockquote", content: [image({ src: "https://example.com/q.png" })] }])),
    );
    expect(found).toEqual([{ blockId: "b1", src: "https://example.com/q.png" }]);
  });

  it("reports the same src once per block, and once per block that holds it", () => {
    const src = "https://example.com/a.png";
    const found = findAdoptableImages(
      doc(
        block("b1", [{ type: "blockquote", content: [image({ src }), image({ src })] }]),
        block("b2", [image({ src })]),
      ),
    );
    expect(found).toEqual([
      { blockId: "b1", src },
      { blockId: "b2", src },
    ]);
  });
});

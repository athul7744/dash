/// <reference types="vitest/globals" />

/**
 * Inserting image files against the real editor schema.
 *
 * The ordering is the thing worth pinning down: the block id is minted before
 * the bytes are cached, the bytes are cached before anything is inserted, the
 * inserted block carries both ids, and the `attachments` row is written last —
 * after the flush that lands the `blocks` row it points at, or the server refuses
 * it. That is also what lets the persister's delete cascade own cleanup, and what
 * keeps a failed write from leaving a broken image in the page.
 */

const { storeFileBytes, insertAttachmentRow, discardStoredBytes, flushAllBlockDocumentPersisters } = vi.hoisted(
  () => ({
    storeFileBytes: vi.fn(),
    insertAttachmentRow: vi.fn(),
    discardStoredBytes: vi.fn(),
    flushAllBlockDocumentPersisters: vi.fn(),
  }),
);

vi.mock("@/lib/storage/attachments", () => ({ storeFileBytes, insertAttachmentRow, discardStoredBytes }));
vi.mock("@/lib/notes/editor/block-persister", () => ({ flushAllBlockDocumentPersisters }));

import { Editor } from "@tiptap/core";
import History from "@tiptap/extension-history";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import { NotesDocument, BlockNode, asBlockContent } from "@/lib/notes/editor/block-schema";
import { BlockIdPlugin } from "@/lib/notes/editor/block-id-plugin";
import { BlockNormalize } from "@/lib/notes/editor/block-normalize";
import {
  clipboardImageFiles,
  imageFilesFrom,
  insertImageFiles,
} from "@/lib/notes/editor/image-insert";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/paths";

// The production image node renders through a React NodeView that reaches for
// PowerSync, which jsdom can't host. The attr shape is what matters here, so the
// schema takes a bare Image carrying the same `attachmentId` attr.
const TestImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), attachmentId: { default: null } };
  },
});

function makeEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      NotesDocument,
      BlockNode,
      asBlockContent(Paragraph),
      asBlockContent(TestImage),
      Text,
      History,
      BlockIdPlugin,
      BlockNormalize,
    ],
    content: { type: "doc", content: [{ type: "block", attrs: { blockId: "b1", blockType: "text" }, content: [{ type: "paragraph" }] }] } as never,
  });
}

function imageFile(name = "shot.png", type = "image/png", size = 8): File {
  const file = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
  if (size > 1024) Object.defineProperty(file, "size", { value: size });
  return file;
}

/** Every image node in the document, with the id of the block holding it. */
function imageNodes(editor: Editor): Array<{ blockId: string | null; attachmentId: string | null }> {
  const out: Array<{ blockId: string | null; attachmentId: string | null }> = [];
  editor.state.doc.forEach((block) => {
    block.forEach((child) => {
      if (child.type.name === "image") {
        out.push({ blockId: block.attrs.blockId ?? null, attachmentId: child.attrs.attachmentId ?? null });
      }
    });
  });
  return out;
}

let editor: Editor;

beforeEach(() => {
  storeFileBytes.mockReset();
  insertAttachmentRow.mockReset();
  insertAttachmentRow.mockResolvedValue(undefined);
  discardStoredBytes.mockReset();
  discardStoredBytes.mockResolvedValue(undefined);
  flushAllBlockDocumentPersisters.mockReset();
  flushAllBlockDocumentPersisters.mockResolvedValue(undefined);
  let n = 0;
  storeFileBytes.mockImplementation(() => {
    n += 1;
    return Promise.resolve({ id: `att-${n}`, record: { id: `att-${n}`, file_path: `p/att-${n}.png` } });
  });
  editor = makeEditor();
  editor.commands.focus("end");
});

afterEach(() => {
  editor.destroy();
});

describe("insertImageFiles", () => {
  it("stores the file against a minted block id and inserts that same block", async () => {
    const inserted = await insertImageFiles(editor.view, [imageFile()]);

    expect(inserted).toBe(1);
    expect(storeFileBytes).toHaveBeenCalledTimes(1);
    const [, target, opts] = storeFileBytes.mock.calls[0];
    expect(opts).toEqual({ fileName: "shot.png", mimeType: "image/png" });

    const images = imageNodes(editor);
    expect(images).toEqual([{ blockId: (target as { blockId: string }).blockId, attachmentId: "att-1" }]);
  });

  it("lands the blocks rows right away so deletes can cascade", async () => {
    await insertImageFiles(editor.view, [imageFile()]);
    expect(flushAllBlockDocumentPersisters).toHaveBeenCalledTimes(1);
  });

  it("inserts one block per file, in order", async () => {
    await insertImageFiles(editor.view, [imageFile("a.png"), imageFile("b.png")]);

    const images = imageNodes(editor);
    expect(images.map((i) => i.attachmentId)).toEqual(["att-1", "att-2"]);
    expect(new Set(images.map((i) => i.blockId)).size).toBe(2);
  });

  it("reports a file that isn't an image and inserts nothing", async () => {
    const onError = vi.fn();
    const inserted = await insertImageFiles(
      editor.view,
      [new File([new Uint8Array(4)], "notes.zip", { type: "application/zip" })],
      { onError },
    );

    expect(inserted).toBe(0);
    expect(storeFileBytes).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("notes.zip"));
    expect(imageNodes(editor)).toEqual([]);
  });

  it("reports an oversized image and inserts nothing", async () => {
    const onError = vi.fn();
    const inserted = await insertImageFiles(
      editor.view,
      [imageFile("huge.png", "image/png", MAX_ATTACHMENT_BYTES + 1)],
      { onError },
    );

    expect(inserted).toBe(0);
    expect(storeFileBytes).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("10 MB"));
  });

  it("leaves no node behind when the file can't be stored", async () => {
    storeFileBytes.mockRejectedValueOnce(new Error("quota"));
    const onError = vi.fn();

    const inserted = await insertImageFiles(editor.view, [imageFile()], { onError });

    expect(inserted).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(imageNodes(editor)).toEqual([]);
    expect(flushAllBlockDocumentPersisters).not.toHaveBeenCalled();
  });

  it("discards cached bytes when the insert itself fails", async () => {
    // A drop position inside an atom has nowhere to put a block, so the slice is
    // rejected. The bytes are already cached at that point and nothing will ever
    // reference them — and no row was written, so dropping the cache is the whole
    // cleanup.
    const onError = vi.fn();
    const inserted = await insertImageFiles(editor.view, [imageFile("a.png"), imageFile("b.png")], {
      at: 9999,
      onError,
    });

    expect(inserted).toBe(0);
    expect(imageNodes(editor)).toEqual([]);
    expect(discardStoredBytes.mock.calls.map(([bytes]) => (bytes as { id: string }).id)).toEqual(["att-1", "att-2"]);
    expect(insertAttachmentRow).not.toHaveBeenCalled();
    expect(flushAllBlockDocumentPersisters).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("keeps stored files when the insert succeeds", async () => {
    await insertImageFiles(editor.view, [imageFile()]);
    expect(discardStoredBytes).not.toHaveBeenCalled();
  });

  it("writes the attachments row only after the blocks row has landed", async () => {
    // Local writes upload in the order they were made. A row written before its
    // `blocks` row reaches the server first, is refused by
    // `attachments_block_id_fkey`, and is dropped — the image then exists on this
    // device alone.
    await insertImageFiles(editor.view, [imageFile()]);

    expect(insertAttachmentRow).toHaveBeenCalledTimes(1);
    expect(flushAllBlockDocumentPersisters.mock.invocationCallOrder[0]).toBeLessThan(
      insertAttachmentRow.mock.invocationCallOrder[0],
    );
    expect(storeFileBytes.mock.invocationCallOrder[0]).toBeLessThan(
      flushAllBlockDocumentPersisters.mock.invocationCallOrder[0],
    );
  });

  it("inserts the files that worked when one of several fails", async () => {
    storeFileBytes.mockReset();
    storeFileBytes
      .mockResolvedValueOnce({ id: "att-1", record: { id: "att-1" } })
      .mockRejectedValueOnce(new Error("quota"))
      .mockResolvedValueOnce({ id: "att-3", record: { id: "att-3" } });
    const onError = vi.fn();

    const inserted = await insertImageFiles(
      editor.view,
      [imageFile("a.png"), imageFile("b.png"), imageFile("c.png")],
      { onError },
    );

    expect(inserted).toBe(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(imageNodes(editor).map((i) => i.attachmentId)).toEqual(["att-1", "att-3"]);
  });
});

describe("clipboard and drag payloads", () => {
  const data = (files: File[], text = "", html = "") =>
    ({
      files,
      getData: (flavor: string) => (flavor === "text/plain" ? text : flavor === "text/html" ? html : ""),
    }) as unknown as DataTransfer;

  it("takes image files off a clipboard that holds nothing else", () => {
    expect(clipboardImageFiles(data([imageFile()]))).toHaveLength(1);
  });

  it("leaves a paste that also carries text or html to text handling", () => {
    expect(clipboardImageFiles(data([imageFile()], "some text"))).toEqual([]);
    expect(clipboardImageFiles(data([imageFile()], "", "<p>rich</p>"))).toEqual([]);
  });

  it("ignores non-image files", () => {
    const zip = new File([new Uint8Array(4)], "a.zip", { type: "application/zip" });
    expect(imageFilesFrom(data([zip]))).toEqual([]);
    expect(imageFilesFrom(data([zip, imageFile()]))).toHaveLength(1);
  });

  it("handles a missing payload", () => {
    expect(imageFilesFrom(null)).toEqual([]);
    expect(clipboardImageFiles(undefined)).toEqual([]);
  });
});

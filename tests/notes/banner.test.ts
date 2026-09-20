/// <reference types="vitest/globals" />

/**
 * A note page's banner: what the page records, and what setting one stores.
 *
 * The banner lives in the page's properties JSON rather than a column, so the
 * reading and writing rules are the whole model — the surface only renders them.
 */

const { updateNotePageProperties, attachFile, fetchRemoteImage } = vi.hoisted(() => ({
  updateNotePageProperties: vi.fn(),
  attachFile: vi.fn(),
  fetchRemoteImage: vi.fn(),
}));

vi.mock("@/lib/notes/notes", () => ({ updateNotePageProperties }));
vi.mock("@/lib/storage/attachments", () => ({ attachFile }));
vi.mock("@/lib/storage/remote-image", () => ({
  fetchRemoteImage,
  imageFileNameFromUrl: (url: string) => url.split("/").pop() || "image",
}));

import {
  bannerImageToDiscard,
  attachBannerFile,
  attachBannerFromUrl,
  clampAlign,
  DEFAULT_BANNER_ALIGN,
  nextAlignFromDrag,
  readPageBanner,
  writePageBanner,
} from "@/lib/notes/banner";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/paths";

beforeEach(() => {
  updateNotePageProperties.mockReset();
  attachFile.mockReset();
  attachFile.mockResolvedValue({ id: "att-1", file_path: "u1/p1/att-1.png" });
  fetchRemoteImage.mockReset();
});

/** A file of a given size without allocating the bytes. */
function imageFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("readPageBanner", () => {
  it("is null for a page with no banner", () => {
    expect(readPageBanner({})).toBeNull();
    expect(readPageBanner(null)).toBeNull();
    expect(readPageBanner({ banner: "" })).toBeNull();
    expect(readPageBanner({ banner: "   " })).toBeNull();
  });

  it("ignores a banner that isn't an attachment id", () => {
    // The properties blob is free-form JSON that older writes and imports also
    // touch, so a wrong type must read as "no banner", not crash the page.
    expect(readPageBanner({ banner: 42 })).toBeNull();
    expect(readPageBanner({ banner: { id: "att-1" } })).toBeNull();
  });

  it("centres a banner with no stored position", () => {
    expect(readPageBanner({ banner: "att-1" })).toEqual({ attachmentId: "att-1", align: DEFAULT_BANNER_ALIGN });
  });

  it("reads a stored position", () => {
    expect(readPageBanner({ banner: "att-1", bannerAlign: 70 })?.align).toBe(70);
  });

  it("clamps a position that couldn't be shown", () => {
    expect(readPageBanner({ banner: "att-1", bannerAlign: -20 })?.align).toBe(0);
    expect(readPageBanner({ banner: "att-1", bannerAlign: 140 })?.align).toBe(100);
    expect(readPageBanner({ banner: "att-1", bannerAlign: "nonsense" })?.align).toBe(DEFAULT_BANNER_ALIGN);
  });
});

describe("clampAlign", () => {
  it("rounds to whole percents", () => {
    expect(clampAlign(33.4)).toBe(33);
    expect(clampAlign("66.7")).toBe(67);
  });
});

describe("writePageBanner", () => {
  it("keeps the rest of the page's properties", () => {
    writePageBanner("p1", { emoji: "star", favorite: true }, { attachmentId: "att-1", align: 50 });

    expect(updateNotePageProperties).toHaveBeenCalledWith("p1", {
      emoji: "star",
      favorite: true,
      banner: "att-1",
    });
  });

  it("stores a position only when it isn't the default", () => {
    writePageBanner("p1", {}, { attachmentId: "att-1", align: 70 });
    expect(updateNotePageProperties.mock.calls[0][1]).toEqual({ banner: "att-1", bannerAlign: 70 });

    writePageBanner("p1", { bannerAlign: 70 }, { attachmentId: "att-1", align: DEFAULT_BANNER_ALIGN });
    expect(updateNotePageProperties.mock.calls[1][1]).toEqual({ banner: "att-1" });
  });

  it("clears both keys when removing", () => {
    writePageBanner("p1", { banner: "att-1", bannerAlign: 70, summary: "keep me" }, null);
    expect(updateNotePageProperties).toHaveBeenCalledWith("p1", { summary: "keep me" });
  });
});

describe("attachBannerFile", () => {
  it("stores the file against the page", async () => {
    const file = imageFile("cover.png", "image/png", 1024);
    const attachment = await attachBannerFile("p1", file);

    expect(attachment.id).toBe("att-1");
    expect(attachFile).toHaveBeenCalledWith(file, { pageId: "p1" }, { fileName: "cover.png", mimeType: "image/png" });
  });

  it("refuses anything that isn't an image", async () => {
    // The picker validates nothing, so this is the only check between a chosen
    // file and the attachment layer.
    await expect(attachBannerFile("p1", imageFile("notes.pdf", "application/pdf", 1024))).rejects.toThrow(/images only/);
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("refuses a file over the attachment cap", async () => {
    const huge = imageFile("huge.png", "image/png", MAX_ATTACHMENT_BYTES + 1);
    await expect(attachBannerFile("p1", huge)).rejects.toThrow(/up to 10 MB/);
    expect(attachFile).not.toHaveBeenCalled();
  });
});

describe("attachBannerFromUrl", () => {
  it("stores what the proxy returns", async () => {
    fetchRemoteImage.mockResolvedValue(new Blob(["bytes"], { type: "image/jpeg" }));

    const attachment = await attachBannerFromUrl("p1", " https://example.com/photo.jpg ");

    expect(fetchRemoteImage).toHaveBeenCalledWith("https://example.com/photo.jpg");
    expect(attachment.id).toBe("att-1");
    expect(attachFile.mock.calls[0][1]).toEqual({ pageId: "p1" });
    expect(attachFile.mock.calls[0][2]).toEqual({ fileName: "photo.jpg", mimeType: "image/jpeg" });
  });

  it("says so when the image can't be fetched", async () => {
    // Which is also the answer offline: the bytes come through the proxy.
    fetchRemoteImage.mockResolvedValue(null);
    await expect(attachBannerFromUrl("p1", "https://example.com/gone.jpg")).rejects.toThrow(/when you're online/);
    expect(attachFile).not.toHaveBeenCalled();
  });

  it("rejects anything that isn't an http URL", async () => {
    await expect(attachBannerFromUrl("p1", "data:image/png;base64,AAA")).rejects.toThrow(/http/);
    expect(fetchRemoteImage).not.toHaveBeenCalled();
  });
});

describe("nextAlignFromDrag", () => {
  it("moves the focal point up as the image is dragged down", () => {
    // Dragging down reveals the top of the image, so the visible band moves up.
    expect(nextAlignFromDrag({ startAlign: 50, dy: 40, height: 200 })).toBe(30);
    expect(nextAlignFromDrag({ startAlign: 50, dy: -40, height: 200 })).toBe(70);
  });

  it("stays inside the frame", () => {
    expect(nextAlignFromDrag({ startAlign: 10, dy: 400, height: 200 })).toBe(0);
    expect(nextAlignFromDrag({ startAlign: 90, dy: -400, height: 200 })).toBe(100);
  });

  it("holds still when the frame has no measured height", () => {
    expect(nextAlignFromDrag({ startAlign: 40, dy: 80, height: 0 })).toBe(40);
  });
});

describe("bannerImageToDiscard", () => {
  it("names the image a replacement makes redundant", () => {
    expect(bannerImageToDiscard("old-file", "new-file")).toBe("old-file");
  });

  it("keeps everything when there was no banner", () => {
    expect(bannerImageToDiscard(null, "new-file")).toBeNull();
    expect(bannerImageToDiscard(undefined, "new-file")).toBeNull();
  });

  it("keeps the file when the same picture is chosen again", () => {
    // Setting a banner can mean reusing a file already on the page, so the
    // previous and the next are the same row — deleting it would take the
    // banner with it.
    expect(bannerImageToDiscard("same-file", "same-file")).toBeNull();
  });
});

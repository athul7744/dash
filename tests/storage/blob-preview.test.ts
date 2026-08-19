/// <reference types="vitest/globals" />

/**
 * The session preview cache. Two properties matter and both are easy to break:
 * a URL must stay the *same string* for as long as an id is cached (the editor
 * rebuilds its `<img>` elements on every save, and a changed src re-decodes), and
 * a URL must never be revoked while something still holds it.
 */

import {
  acquirePreviewUrl,
  blobPreview,
  dropBlobPreview,
  previewUrl,
  primeBlobPreview,
  releasePreviewUrl,
} from "@/lib/storage/blob-preview";

let revoked: string[] = [];
// Monotonic across the file, so a url from one test can't be mistaken for another's.
let minted = 0;

beforeEach(() => {
  revoked = [];
  globalThis.URL.createObjectURL = vi.fn(() => `blob:preview-${++minted}`);
  globalThis.URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

// Drain deferred revokes before the next test replaces the mock.
afterEach(async () => {
  await tick();
});

function blob(size = 4): Blob {
  return new Blob([new Uint8Array(size)]);
}

/** Let the deferred revoke fire. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("blob previews", () => {
  it("serves one stable url and the blob for a primed id", () => {
    const bytes = blob();
    primeBlobPreview("a", bytes);

    const url = previewUrl("a");
    expect(url).toBe("blob:preview-1");
    expect(previewUrl("a")).toBe(url);
    expect(acquirePreviewUrl("a")).toBe(url);
    expect(blobPreview("a")).toBe(bytes);

    releasePreviewUrl("a");
    dropBlobPreview("a");
  });

  it("knows nothing about an unknown id", () => {
    expect(previewUrl("nope")).toBeNull();
    expect(previewUrl(null)).toBeNull();
    expect(blobPreview(undefined)).toBeNull();
    expect(acquirePreviewUrl("nope")).toBeNull();
    expect(() => releasePreviewUrl("nope")).not.toThrow();
  });

  it("revokes a dropped id once, after the tick", async () => {
    primeBlobPreview("b", blob());
    const url = previewUrl("b");

    dropBlobPreview("b");
    expect(previewUrl("b")).toBeNull(); // serves no new consumers
    expect(revoked).toEqual([]); // but not revoked synchronously

    await tick();
    expect(revoked).toEqual([url]);
  });

  it("holds a dropped url until its last holder lets go", async () => {
    primeBlobPreview("c", blob());
    const url = acquirePreviewUrl("c");
    acquirePreviewUrl("c");

    dropBlobPreview("c");
    await tick();
    expect(revoked).toEqual([]);

    releasePreviewUrl("c");
    await tick();
    expect(revoked).toEqual([]); // one holder left

    releasePreviewUrl("c");
    await tick();
    expect(revoked).toEqual([url]);
  });

  it("survives a remount that releases and re-acquires in the same tick", async () => {
    primeBlobPreview("d", blob());
    const url = acquirePreviewUrl("d");

    releasePreviewUrl("d");
    expect(acquirePreviewUrl("d")).toBe(url);

    await tick();
    expect(revoked).toEqual([]);
    expect(previewUrl("d")).toBe(url);

    releasePreviewUrl("d");
    dropBlobPreview("d");
    await tick();
  });

  it("keeps a live url usable while nothing holds it", async () => {
    primeBlobPreview("e", blob());
    const url = previewUrl("e");
    await tick();
    // Not retired, so an unheld entry stays in the cache rather than dying.
    expect(revoked).toEqual([]);
    expect(previewUrl("e")).toBe(url);
    dropBlobPreview("e");
    await tick();
  });

  it("evicts the oldest entries past the entry cap", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `x${i}`);
    for (const id of ids) primeBlobPreview(id, blob());

    expect(previewUrl("x0")).toBeNull();
    expect(previewUrl("x1")).toBeNull();
    expect(previewUrl("x2")).not.toBeNull();
    expect(previewUrl("x9")).not.toBeNull();

    for (const id of ids) dropBlobPreview(id);
    await tick();
  });

  it("evicts on the byte budget, keeping the newest", async () => {
    primeBlobPreview("big-1", blob(20 * 1024 * 1024));
    primeBlobPreview("big-2", blob(20 * 1024 * 1024));

    expect(previewUrl("big-1")).toBeNull();
    expect(previewUrl("big-2")).not.toBeNull();

    dropBlobPreview("big-2");
    await tick();
  });

  it("reclaims bytes on drop", async () => {
    primeBlobPreview("y1", blob(20 * 1024 * 1024));
    dropBlobPreview("y1");
    await tick();

    // If the drop hadn't reclaimed those bytes, this pair would evict itself.
    primeBlobPreview("y2", blob(10 * 1024 * 1024));
    primeBlobPreview("y3", blob(10 * 1024 * 1024));
    expect(previewUrl("y2")).not.toBeNull();
    expect(previewUrl("y3")).not.toBeNull();

    dropBlobPreview("y2");
    dropBlobPreview("y3");
    await tick();
  });
});

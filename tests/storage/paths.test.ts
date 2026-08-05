import { describe, expect, it } from "vitest";

import {
  buildAttachmentPath,
  extFor,
  isAllowed,
  MAX_ATTACHMENT_BYTES,
  orphanPaths,
} from "@/lib/storage/paths";

describe("isAllowed", () => {
  it("accepts images, text, pdf under the cap", () => {
    expect(isAllowed("image/png", 1000)).toBe(true);
    expect(isAllowed("image/heic", 1000)).toBe(true); // any image/*
    expect(isAllowed("text/csv", 1000)).toBe(true); // any text/*
    expect(isAllowed("application/pdf", 1000)).toBe(true);
  });

  it("rejects empty, oversized, and disallowed types", () => {
    expect(isAllowed("image/png", 0)).toBe(false);
    expect(isAllowed("image/png", MAX_ATTACHMENT_BYTES + 1)).toBe(false);
    expect(isAllowed("application/zip", 1000)).toBe(false);
    expect(isAllowed("application/octet-stream", 1000)).toBe(false);
  });

  it("accepts exactly at the cap", () => {
    expect(isAllowed("image/jpeg", MAX_ATTACHMENT_BYTES)).toBe(true);
  });
});

describe("extFor", () => {
  it("prefers the file name's extension", () => {
    expect(extFor("photo.JPG", "image/png")).toBe("jpg"); // lowercased
    expect(extFor("archive.tar.gz", "application/pdf")).toBe("gz");
  });

  it("falls back to the mime type, then bin", () => {
    expect(extFor("noext", "image/png")).toBe("png");
    expect(extFor("", "application/pdf")).toBe("pdf");
    expect(extFor("", "application/unknown")).toBe("bin");
  });

  it("ignores a leading-dot or trailing-dot name", () => {
    expect(extFor(".gitignore", "text/plain")).toBe("txt");
    expect(extFor("trailing.", "image/webp")).toBe("webp");
  });
});

describe("buildAttachmentPath", () => {
  it("lays out {userId}/{entityId}/{id}.{ext} with user id first", () => {
    expect(buildAttachmentPath("u1", "e2", "a3", "shot.png", "image/png")).toBe("u1/e2/a3.png");
  });

  it("derives the extension from the mime type when the name has none", () => {
    expect(buildAttachmentPath("u", "e", "id", "preview", "image/jpeg")).toBe("u/e/id.jpg");
  });
});

describe("orphanPaths", () => {
  it("returns objects with no matching live row", () => {
    const objects = ["u/e1/a.png", "u/e2/b.pdf", "u/e3/c.jpg"];
    const live = ["u/e2/b.pdf"];
    expect(orphanPaths(objects, live)).toEqual(["u/e1/a.png", "u/e3/c.jpg"]);
  });

  it("keeps everything when all rows are live", () => {
    const objects = ["u/e1/a.png"];
    expect(orphanPaths(objects, ["u/e1/a.png"])).toEqual([]);
  });

  it("treats an empty live set as all-orphaned", () => {
    const objects = ["u/e1/a.png", "u/e2/b.pdf"];
    expect(orphanPaths(objects, [])).toEqual(objects);
  });
});

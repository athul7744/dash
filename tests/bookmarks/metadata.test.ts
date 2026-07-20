import { describe, expect, it } from "vitest";

import { parseMetadataHtml } from "@/lib/bookmarks/metadata";

describe("parseMetadataHtml", () => {
  it("prefers og:title over the <title> tag", () => {
    const html = `
      <head>
        <title>Fallback Title</title>
        <meta property="og:title" content="OG Title" />
      </head>`;
    expect(parseMetadataHtml(html).title).toBe("OG Title");
  });

  it("falls back to the <title> tag when no og:title", () => {
    const html = `<head><title>Just A Title</title></head>`;
    expect(parseMetadataHtml(html).title).toBe("Just A Title");
  });

  it("decodes common HTML entities in titles", () => {
    const html = `<title>Cats &amp; Dogs &#39;n Friends</title>`;
    expect(parseMetadataHtml(html).title).toBe("Cats & Dogs 'n Friends");
  });

  it("decodes numeric (decimal + hex) and extra named entities", () => {
    const html = `<title>me &#064; home &#x40; work &mdash; notes &rsquo;24</title>`;
    expect(parseMetadataHtml(html).title).toBe("me @ home @ work — notes ’24");
  });

  it("reads description and image from og tags (either attribute order)", () => {
    const html = `
      <meta content="A description" property="og:description">
      <meta property="og:image" content="https://example.com/img.png">`;
    const meta = parseMetadataHtml(html);
    expect(meta.description).toBe("A description");
    expect(meta.image).toBe("https://example.com/img.png");
  });

  it("falls back to the description meta name", () => {
    const html = `<meta name="description" content="Plain description">`;
    expect(parseMetadataHtml(html).description).toBe("Plain description");
  });

  it("returns empty fields for missing tags / malformed html", () => {
    expect(parseMetadataHtml("<html><body>no head</body>")).toEqual({
      title: "",
      description: "",
      image: "",
    });
    expect(parseMetadataHtml("")).toEqual({ title: "", description: "", image: "" });
  });
});

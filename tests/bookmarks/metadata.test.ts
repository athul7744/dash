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

describe("metadata deep in a head full of script", () => {
  it("still finds the og tags", () => {
    // Real case: YouTube's og tags sit ~685 KB into the page, behind inline
    // script. The route's byte cap decides whether the parser ever sees this —
    // at 512 KB a video link came back with no title, description or image.
    const filler = `<script>${"x".repeat(600 * 1024)}</script>`;
    const html = `<html><head>${filler}<meta property="og:title" content="A Video"><meta property="og:image" content="https://i.example.com/t.jpg"></head><body></body></html>`;
    expect(parseMetadataHtml(html)).toMatchObject({
      title: "A Video",
      image: "https://i.example.com/t.jpg",
    });
  });

  it("finds nothing when the head was cut short of them", () => {
    // What a too-small cap produces: the parser is fine, it simply never
    // received the tags.
    const truncated = `<html><head><script>${"x".repeat(1024)}</script>`;
    expect(parseMetadataHtml(truncated)).toEqual({ title: "", description: "", image: "" });
  });
});

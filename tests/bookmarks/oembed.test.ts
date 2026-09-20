/// <reference types="vitest/globals" />

/**
 * Finding a page's oEmbed endpoint.
 *
 * This exists for pages that build themselves in the browser: YouTube serves a
 * fetcher a shell with no og tags and an empty `<title>` whatever User-Agent it
 * is asked with, so scraping cannot work and its oEmbed endpoint is the only
 * supported answer.
 *
 * A discovered endpoint comes out of a page and is therefore attacker-chosen —
 * these only find it; the route is what puts it through the SSRF guard.
 */

import { oembedEndpoint, parseOembed } from "@/lib/bookmarks/oembed";

describe("oembedEndpoint", () => {
  it("prefers what the page advertises", () => {
    const html = `<head><link rel="alternate" type="application/json+oembed" href="https://site.example/oembed?url=x&amp;format=json"></head>`;
    // Entities decoded: the href is read out of HTML, not out of a URL bar.
    expect(oembedEndpoint("https://site.example/post", html)).toBe("https://site.example/oembed?url=x&format=json");
  });

  it("reads the link with its attributes the other way round", () => {
    const html = `<link href="https://site.example/oembed" type="application/json+oembed">`;
    expect(oembedEndpoint("https://site.example/post", html)).toBe("https://site.example/oembed");
  });

  it("knows YouTube, which advertises nothing", () => {
    expect(oembedEndpoint("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123",
    );
  });

  it("knows a youtu.be short link and an m. subdomain", () => {
    expect(oembedEndpoint("https://youtu.be/abc123")).toContain("youtube.com/oembed");
    expect(oembedEndpoint("https://m.youtube.com/watch?v=abc123")).toContain("youtube.com/oembed");
  });

  it("does not mistake a lookalike host for YouTube", () => {
    // `endsWith(".youtube.com")` is the guard; this must not satisfy it.
    expect(oembedEndpoint("https://notyoutube.com/watch?v=abc")).toBeNull();
    expect(oembedEndpoint("https://youtube.com.evil.test/watch?v=abc")).toBeNull();
  });

  it("refuses an endpoint on someone else's host", () => {
    // The href is chosen by the page, which makes it the one attacker-picked URL
    // this server would fetch. The blocked-host guard alone would still follow a
    // redirect from a public host to a private one.
    const html = `<link rel="alternate" type="application/json+oembed" href="https://evil.test/oembed?url=http://169.254.169.254/">`;
    expect(oembedEndpoint("https://site.example/post", html)).toBeNull();
  });

  it("falls back to a known provider when discovery points elsewhere", () => {
    const html = `<link rel="alternate" type="application/json+oembed" href="https://evil.test/oembed">`;
    expect(oembedEndpoint("https://www.youtube.com/watch?v=abc", html)).toContain("youtube.com/oembed");
  });

  it("ignores a relative href rather than guessing at it", () => {
    const html = `<link rel="alternate" type="application/json+oembed" href="/oembed?url=x">`;
    expect(oembedEndpoint("https://site.example/post", html)).toBeNull();
  });

  it("has nothing to offer an ordinary page", () => {
    expect(oembedEndpoint("https://example.com/post", "<head><title>Hi</title></head>")).toBeNull();
    expect(oembedEndpoint("not a url")).toBeNull();
  });
});

describe("parseOembed", () => {
  it("takes the title and thumbnail", () => {
    expect(parseOembed({ title: "Crab Rave", thumbnail_url: "https://i.ytimg.com/vi/x/hq.jpg", author_name: "Noisestorm" }))
      .toEqual({ title: "Crab Rave", image: "https://i.ytimg.com/vi/x/hq.jpg" });
  });

  it("leaves the description alone — oEmbed has none", () => {
    // The author's name is not a summary of the video, so it isn't borrowed
    // as one.
    expect(parseOembed({ author_name: "Noisestorm" })).toEqual({ title: "", image: "" });
  });

  it("tolerates a response that isn't what it should be", () => {
    expect(parseOembed(null)).toEqual({ title: "", image: "" });
    expect(parseOembed("nope")).toEqual({ title: "", image: "" });
    expect(parseOembed({ title: 42, thumbnail_url: [] })).toEqual({ title: "", image: "" });
  });
});

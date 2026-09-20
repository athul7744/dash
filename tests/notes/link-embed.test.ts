/// <reference types="vitest/globals" />

/**
 * What a link card stores.
 *
 * The card is a snapshot taken once, so these are the values a note will still
 * be showing months later, offline — and the text forms are what edge reconcile,
 * the search index and markdown export each read. A card that degrades to the
 * wrong text takes its link with it.
 */

import {
  buildLinkEmbedAttrs,
  embedHost,
  isEmbeddableUrl,
  linkEmbedLabel,
  linkEmbedMarkdown,
  linkEmbedSearchText,
  linkEmbedText,
  parseLinkEmbedAttrs,
} from "@/lib/notes/link-embed";

describe("embedHost", () => {
  it("drops www, which every card would otherwise start with", () => {
    expect(embedHost("https://www.example.com/a/b")).toBe("example.com");
    expect(embedHost("https://docs.example.com")).toBe("docs.example.com");
  });

  it("is empty for something that isn't a URL", () => {
    expect(embedHost("not a url")).toBe("");
  });
});

describe("buildLinkEmbedAttrs", () => {
  it("keeps what the lookup found", () => {
    const attrs = buildLinkEmbedAttrs(
      "https://example.com/post",
      { title: "A Post", description: "About things.", host: "example.com" },
      "att-1",
    );
    expect(attrs).toEqual({
      url: "https://example.com/post",
      title: "A Post",
      description: "About things.",
      image: "att-1",
      host: "example.com",
    });
  });

  it("still makes a card when the lookup found nothing", () => {
    // A site that blocks the fetch, or an embed made offline. The URL and its
    // host are enough to show something and to click through.
    const attrs = buildLinkEmbedAttrs("https://www.example.com/post", null, null);
    expect(attrs.title).toBe("");
    expect(attrs.image).toBeNull();
    expect(attrs.host).toBe("example.com");
  });

  it("trims a description that is a page rather than a summary", () => {
    const attrs = buildLinkEmbedAttrs("https://example.com", { description: "x".repeat(400) }, null);
    expect(attrs.description).toHaveLength(301); // 300 + the ellipsis
    expect(attrs.description.endsWith("…")).toBe(true);
  });

  it("prefers the host the lookup reported, without its www", () => {
    const attrs = buildLinkEmbedAttrs("https://example.com/x", { host: "www.redirected.com" }, null);
    expect(attrs.host).toBe("redirected.com");
  });
});

describe("parseLinkEmbedAttrs", () => {
  it("tolerates a node whose attrs are missing or wrongly typed", () => {
    expect(parseLinkEmbedAttrs({ url: "https://example.com", title: 42, image: "" })).toEqual({
      url: "https://example.com",
      title: "",
      description: "",
      image: null,
      host: "example.com",
    });
  });

  it("derives the host when one was never stored", () => {
    expect(parseLinkEmbedAttrs({ url: "https://www.example.com/a" }).host).toBe("example.com");
  });
});

describe("what a card degrades to", () => {
  const attrs = buildLinkEmbedAttrs(
    "https://example.com/post",
    { title: "A Post", description: "About things." },
    "att-1",
  );

  it("reads as its URL in plain text, so the link survives", () => {
    // Text extraction feeds edge reconcile and markdown round-trips; a title
    // points nowhere.
    expect(linkEmbedText(attrs)).toBe("https://example.com/post");
  });

  it("is findable by title and description", () => {
    expect(linkEmbedSearchText(attrs)).toBe("A Post About things. https://example.com/post");
  });

  it("exports as the link it was made from", () => {
    expect(linkEmbedMarkdown(attrs)).toBe("[A Post](https://example.com/post)");
  });

  it("never labels itself blank", () => {
    expect(linkEmbedLabel(buildLinkEmbedAttrs("https://example.com/x", null, null))).toBe("example.com");
    expect(linkEmbedLabel(parseLinkEmbedAttrs({ url: "mailto:a@b.c" }))).toBe("mailto:a@b.c");
  });
});

describe("isEmbeddableUrl", () => {
  it("takes a single http(s) URL", () => {
    expect(isEmbeddableUrl("https://example.com")).toBe(true);
    expect(isEmbeddableUrl("  http://example.com/a?b=c  ")).toBe(true);
  });

  it("refuses anything the metadata route would refuse anyway", () => {
    expect(isEmbeddableUrl("mailto:a@b.c")).toBe(false);
    expect(isEmbeddableUrl("javascript:alert(1)")).toBe(false);
    expect(isEmbeddableUrl("file:///etc/passwd")).toBe(false);
  });

  it("refuses prose that merely contains a URL", () => {
    expect(isEmbeddableUrl("see https://example.com")).toBe(false);
    expect(isEmbeddableUrl("")).toBe(false);
    expect(isEmbeddableUrl("example.com")).toBe(false);
  });
});

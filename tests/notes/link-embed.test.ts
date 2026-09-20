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
  mergeLinkEmbedEdit,
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

describe("mergeLinkEmbedEdit", () => {
  const current = buildLinkEmbedAttrs(
    "https://example.com/old",
    { title: "Old Page", description: "Old copy.", image: "x", host: "example.com" },
    "att-old",
  );

  it("relabels without touching anything else", () => {
    // The address didn't change, so nothing was re-fetched and nothing else moves.
    const next = mergeLinkEmbedEdit(current, { url: current.url, title: "My label" }, null);
    expect(next).toEqual({ ...current, title: "My label" });
  });

  it("re-reads the page when the address changes", () => {
    const next = mergeLinkEmbedEdit(
      current,
      { url: "https://other.com/new", title: current.title },
      { metadata: { title: "New Page", description: "New copy.", host: "other.com" }, imageAttachmentId: "att-new" },
    );
    expect(next).toEqual({
      url: "https://other.com/new",
      title: "New Page",
      description: "New copy.",
      image: "att-new",
      host: "other.com",
    });
  });

  it("keeps a title you typed yourself across an address change", () => {
    const next = mergeLinkEmbedEdit(
      current,
      { url: "https://other.com/new", title: "My label" },
      { metadata: { title: "New Page" }, imageAttachmentId: null },
    );
    expect(next.title).toBe("My label");
  });

  it("replaces a title left over from the old page", () => {
    // Untouched, so it describes a page this card no longer points at.
    const next = mergeLinkEmbedEdit(
      current,
      { url: "https://other.com/new", title: current.title },
      { metadata: { title: "New Page" }, imageAttachmentId: null },
    );
    expect(next.title).toBe("New Page");
  });

  it("carries a new address through even when nothing could be re-read", () => {
    // The caller failed to re-read — offline, or it couldn't find the card's
    // block. Keeping the old URL would silently discard the edit and leave the
    // card pointing somewhere the user just changed it away from.
    const next = mergeLinkEmbedEdit(current, { url: "https://other.com/new", title: current.title }, null);
    expect(next.url).toBe("https://other.com/new");
    expect(next.host).toBe("other.com");
  });

  it("keeps the old address when the new one is blank", () => {
    expect(mergeLinkEmbedEdit(current, { url: "   ", title: "x" }, null).url).toBe(current.url);
  });

  it("still lands a card when the new address can't be read", () => {
    const next = mergeLinkEmbedEdit(current, { url: "https://other.com/new", title: "" }, { metadata: null, imageAttachmentId: null });
    expect(next).toMatchObject({ url: "https://other.com/new", title: "", image: null, host: "other.com" });
  });
});

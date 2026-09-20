/// <reference types="vitest/globals" />

/**
 * Which anchors the link toolbar claims, and how wide a range it claims for one.
 *
 * The toolbar hangs off any `<a href>` in the editor and infers the mark's end
 * from the anchor's rendered text length. Both assumptions broke when link
 * preview cards arrived: a card is an `<a>` too, but it is a *node* — there is
 * no link mark to edit or remove, and its text spans a whole block, so the
 * inferred end landed past the end of the document. "Remove link" then asked
 * ProseMirror to resolve a position that doesn't exist and threw.
 *
 * Both halves of that are reproduced here against the same pure rules the view
 * uses, since the view itself needs a live EditorView to construct.
 */

/** The guard in `linkAt`: a card's anchor is not a link the toolbar can edit. */
function isToolbarLink(anchor: HTMLElement): boolean {
  return !anchor.closest("[data-link-embed], .note-link-embed");
}

/** The clamp in `show`: an inferred end can never leave the document. */
function toolbarRange(from: number, textLength: number, docSize: number): { from: number; to: number } | null {
  const to = Math.min(from + textLength, docSize);
  if (from < 0 || to <= from) return null;
  return { from, to };
}

const html = (markup: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host.firstElementChild as HTMLElement;
};

describe("which anchors the toolbar claims", () => {
  it("claims an ordinary link", () => {
    expect(isToolbarLink(html('<a href="https://example.com">a link</a>'))).toBe(true);
  });

  it("leaves a link preview card alone", () => {
    // The card renders as an anchor, but it is a node: there is no mark to
    // remove, and its text is the whole card.
    expect(isToolbarLink(html('<a href="https://example.com" data-link-embed="true">Title body</a>'))).toBe(false);
  });

  it("leaves anything inside a card alone", () => {
    const card = html('<div class="note-link-embed"><a href="https://example.com"><span>Title</span></a></div>');
    const inner = card.querySelector("a") as HTMLElement;
    expect(isToolbarLink(inner)).toBe(false);
  });
});

describe("the range the toolbar claims", () => {
  it("covers the link's text", () => {
    expect(toolbarRange(4, 6, 100)).toEqual({ from: 4, to: 10 });
  });

  it("never runs past the end of the document", () => {
    // This is the crash: `removeMark` past the end throws rather than no-opping.
    expect(toolbarRange(90, 500, 100)).toEqual({ from: 90, to: 100 });
  });

  it("claims nothing when there is nothing to claim", () => {
    expect(toolbarRange(100, 0, 100)).toBeNull();
    expect(toolbarRange(100, 40, 100)).toBeNull();
    expect(toolbarRange(-1, 5, 100)).toBeNull();
  });
});

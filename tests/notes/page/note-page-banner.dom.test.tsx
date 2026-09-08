/// <reference types="vitest/globals" />

/**
 * The banner on a note page.
 *
 * What matters here is that the stored crop is what's shown, that a reposition
 * only lands when it's saved, and that removing the banner leaves the page's other
 * properties alone. The write path is the real one (`@/lib/notes/banner`) with only
 * the page update mocked, so a wrong property shape fails here.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { updateNotePageProperties } = vi.hoisted(() => ({ updateNotePageProperties: vi.fn() }));

const RESOLVED: ImageSource = { url: "blob:cover", isPreview: true, isLoading: false, isMissing: false, syncState: "synced" };
let imageSource: ImageSource = RESOLVED;

vi.mock("@/lib/notes/notes", () => ({ updateNotePageProperties }));
vi.mock("@/hooks/use-image-source", () => ({ useImageSource: () => imageSource }));
vi.mock("@/hooks/use-attachment-url", () => ({ useAttachmentUrl: () => "blob:thumb" }));
vi.mock("@/lib/notes/editor/image-insert", () => ({ pickImageFiles: vi.fn(async () => []) }));
vi.mock("@/lib/storage/attachments", () => ({ attachFile: vi.fn() }));
vi.mock("@/lib/storage/remote-image", () => ({ fetchRemoteImage: vi.fn(), imageFileNameFromUrl: () => "image" }));
vi.mock("@/components/toast/ToastProvider", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import type { ImageSource } from "@/hooks/use-image-source";
import { NotePageBanner } from "@/components/notes/page/NotePageBanner";

const FRAME_HEIGHT = 200;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  updateNotePageProperties.mockReset();
  imageSource = RESOLVED;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  // jsdom has neither pointer capture nor layout, and the drag needs both.
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    height: FRAME_HEIGHT,
    width: 600,
    top: 0,
    left: 0,
    right: 600,
    bottom: FRAME_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function render(properties: Record<string, unknown>) {
  act(() => {
    root.render(<NotePageBanner pageId="page-1" pageProperties={properties} attachments={[]} />);
  });
}

const image = () => container.querySelector("img");
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((element) => element.textContent?.includes(label));

/** React listens by native event type, and jsdom has no PointerEvent. */
function pointer(type: string, clientY: number) {
  const frame = container.querySelector(".note-banner") as HTMLElement;
  act(() => {
    frame.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY }));
  });
}

describe("NotePageBanner", () => {
  it("renders nothing for a page with no banner", () => {
    render({ emoji: "star" });
    expect(container.textContent).toBe("");
  });

  it("renders nothing when the banner's file is gone", () => {
    // Deleted from the page's files, or not yet synced to this device — either way
    // a broken frame is worse than none.
    imageSource = { ...imageSource, url: null, isMissing: true };
    render({ banner: "att-1" });
    expect(container.querySelector(".note-banner")).toBeNull();
  });

  it("shows the stored crop", () => {
    render({ banner: "att-1", bannerAlign: 70 });
    expect(image()?.getAttribute("src")).toBe("blob:cover");
    expect(image()?.style.objectPosition).toBe("50% 70%");
  });

  it("centres a banner with no stored crop", () => {
    render({ banner: "att-1" });
    expect(image()?.style.objectPosition).toBe("50% 50%");
  });

  it("clears both keys when removed, keeping the rest of the page", () => {
    render({ banner: "att-1", bannerAlign: 70, summary: "keep me" });
    act(() => button("Remove")?.click());

    expect(updateNotePageProperties).toHaveBeenCalledWith("page-1", { summary: "keep me" });
  });

  it("follows the drag and stores it on save", () => {
    render({ banner: "att-1", bannerAlign: 50 });
    act(() => button("Reposition")?.click());

    pointer("pointerdown", 100);
    pointer("pointermove", 140);

    // A fifth of the frame's height downward moves the focal point up by 20%.
    expect(image()?.style.objectPosition).toBe("50% 30%");
    expect(updateNotePageProperties).not.toHaveBeenCalled();

    pointer("pointerup", 140);
    act(() => button("Save")?.click());

    expect(updateNotePageProperties).toHaveBeenCalledWith("page-1", { banner: "att-1", bannerAlign: 30 });
  });

  it("puts the crop back when a reposition is cancelled", () => {
    render({ banner: "att-1", bannerAlign: 60 });
    act(() => button("Reposition")?.click());

    pointer("pointerdown", 100);
    pointer("pointermove", 40);
    expect(image()?.style.objectPosition).toBe("50% 90%");

    act(() => button("Cancel")?.click());

    expect(updateNotePageProperties).not.toHaveBeenCalled();
    expect(image()?.style.objectPosition).toBe("50% 60%");
  });

  it("does not start a drag from the controls", () => {
    // The frame captures the pointer to keep a drag alive outside itself, and an
    // active capture retargets the click that follows to the capturing element —
    // so capturing on a press over Save or Cancel swallows the button entirely.
    render({ banner: "att-1", bannerAlign: 50 });
    act(() => button("Reposition")?.click());

    const save = button("Save") as HTMLButtonElement;
    act(() => save.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: 100 })));
    pointer("pointermove", 160);
    expect(image()?.style.objectPosition).toBe("50% 50%");

    act(() => save.click());
    expect(updateNotePageProperties).toHaveBeenCalledWith("page-1", { banner: "att-1" });
    expect(button("Reposition")).toBeDefined();
  });

  it("ignores a drag when not repositioning", () => {
    render({ banner: "att-1", bannerAlign: 50 });

    pointer("pointerdown", 100);
    pointer("pointermove", 20);

    expect(image()?.style.objectPosition).toBe("50% 50%");
  });
});

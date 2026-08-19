/// <reference types="vitest/globals" />

/**
 * The client side of the image proxy: every remote image the app stores — a
 * bookmark preview, an image pasted into a note as a URL — comes through here,
 * and every failure has to read as "no image" rather than throw.
 */

import { fetchRemoteImage, imageFileNameFromUrl } from "@/lib/storage/remote-image";

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string) => Promise<Response> | Response) {
  const fn = vi.fn((input: RequestInfo | URL) => Promise.resolve(impl(String(input))));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("fetchRemoteImage", () => {
  it("requests the proxy with the url encoded", async () => {
    const fetchMock = mockFetch(() => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));

    const blob = await fetchRemoteImage("https://example.com/a b.png?x=1&y=2");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/remote-image?url=https%3A%2F%2Fexample.com%2Fa%20b.png%3Fx%3D1%26y%3D2",
    );
    expect(blob?.size).toBe(3);
  });

  it("returns null on a non-ok response", async () => {
    mockFetch(() => new Response("nope", { status: 415 }));
    expect(await fetchRemoteImage("https://example.com/a.png")).toBeNull();
  });

  it("returns null on an empty body", async () => {
    mockFetch(() => new Response(new Uint8Array([]), { status: 200 }));
    expect(await fetchRemoteImage("https://example.com/a.png")).toBeNull();
  });

  it("returns null when the fetch throws (offline)", async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    expect(await fetchRemoteImage("https://example.com/a.png")).toBeNull();
  });
});

describe("imageFileNameFromUrl", () => {
  it("takes the url basename", () => {
    expect(imageFileNameFromUrl("https://example.com/media/photo.jpg")).toBe("photo.jpg");
  });

  it("falls back when there's no basename", () => {
    expect(imageFileNameFromUrl("https://example.com/")).toBe("image");
    expect(imageFileNameFromUrl("https://example.com/", "preview")).toBe("preview");
  });

  it("falls back on an unparseable url", () => {
    expect(imageFileNameFromUrl("not a url")).toBe("image");
  });
});

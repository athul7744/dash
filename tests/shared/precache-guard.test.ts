/// <reference types="vitest/globals" />

/**
 * What the service worker is allowed to keep, and what the sign-in check sees.
 *
 * The two halves of one failure: a static file routed through the sign-in check
 * was answered with the login page, and the precache stored that answer under
 * the file's URL, where it stayed for as long as the file was unchanged. Either
 * half on its own is enough to prevent it, which is why both are pinned here.
 */

import { refuseRedirectedPrecache } from "@/lib/shared/precache-guard";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: {} }));

const decide = (response: Partial<Response> | undefined) =>
  refuseRedirectedPrecache.cacheWillUpdate!({
    request: new Request("https://dash.test/icon-tasks.svg"),
    response: response as Response,
  } as Parameters<NonNullable<typeof refuseRedirectedPrecache.cacheWillUpdate>>[0]);

describe("refuseRedirectedPrecache", () => {
  it("keeps an ordinary response", async () => {
    const response = { status: 200, redirected: false } as Response;
    expect(await decide(response)).toBe(response);
  });

  it("refuses a response that arrived by redirect", async () => {
    // What the sign-in check produces: a 307 to /login, followed to a 200 page.
    expect(await decide({ status: 200, redirected: true })).toBeNull();
  });

  it("still refuses an error, which supplying a plugin stops Serwist doing", async () => {
    expect(await decide({ status: 404, redirected: false })).toBeNull();
    expect(await decide({ status: 500, redirected: false })).toBeNull();
  });

  it("refuses no response at all", async () => {
    expect(await decide(undefined)).toBeNull();
  });
});

describe("the sign-in check's matcher", () => {
  // Next matches the pattern against the whole path; anchoring it here does the same.
  const gated = async (path: string) => {
    const { config } = await import("@/proxy");
    return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));
  };

  it.each([
    "/icon-tasks.svg",
    "/icon-tracker.svg",
    "/icon-bookmarks.svg",
    "/icon-192x192.png",
    "/icon.svg",
    "/favicon.ico",
    "/icons/fluent-emoji.svg",
    "/manifest.json",
    "/robots.txt",
    "/sw.js",
    "/swe-worker-abc123.js",
    "/_next/static/chunks/main.js",
  ])("lets %s through without a session", async (path) => {
    expect(await gated(path)).toBe(false);
  });

  it.each(["/", "/tasks", "/tracker/week", "/notes/some-page-id", "/day/2026-09-22", "/login", "/api/bookmark-metadata"])(
    "checks the session for %s",
    async (path) => {
      expect(await gated(path)).toBe(true);
    },
  );
});

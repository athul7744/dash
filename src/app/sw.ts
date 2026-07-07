/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  // navigationPreload disabled: navigations are served cache-first below, so a
  // parallel network preload would just be wasted work on every launch.
  runtimeCaching: [
    // Serve the app shell + RSC payloads cache-first for instant launch and
    // instant in-app navigation. This is a single-user local-first app — data
    // comes from local SQLite, routes are statically prerendered — so a slightly
    // stale shell is fine and revalidates in the background. These replace
    // Serwist's default NetworkFirst (10s timeout) entries, which made cold
    // launches and route hops on poor/no network wait for the network first.
    //
    // Order matters: Serwist uses the first matching entry, and the prefetch
    // matcher (both RSC headers) is more specific than the plain RSC matcher, so
    // it must come first. Same cacheNames as the defaults so existing cached
    // entries are reused. ExpirationPlugin bounds size only (no maxAgeSeconds) so
    // offline launches after a long gap still find a cached response.
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        request.headers.get("RSC") === "1" &&
        request.headers.get("Next-Router-Prefetch") === "1" &&
        sameOrigin &&
        !pathname.startsWith("/api/"),
      handler: new StaleWhileRevalidate({
        cacheName: "pages-rsc-prefetch",
        plugins: [new ExpirationPlugin({ maxEntries: 32 })],
      }),
    },
    {
      matcher: ({ request, url: { pathname }, sameOrigin }) =>
        request.headers.get("RSC") === "1" &&
        sameOrigin &&
        !pathname.startsWith("/api/"),
      handler: new StaleWhileRevalidate({
        cacheName: "pages-rsc",
        plugins: [new ExpirationPlugin({ maxEntries: 32 })],
      }),
    },
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new StaleWhileRevalidate({
        cacheName: "pages",
        plugins: [new ExpirationPlugin({ maxEntries: 64 })],
      }),
    },
    ...defaultCache,
  ],
});

// --- Web Push ---
// These coexist with Serwist: addEventListeners() below wires lifecycle/fetch/message
// events only, never push/notificationclick, so registering our own is purely additive.

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Dash", body: event.data.text(), url: "/" };
  }

  const { title = "Dash", body = "", url = "/" } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data as { url?: string } | null)?.url ?? "/";
  const targetHref = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        // Reuse an already-open window: focus it and navigate if it's elsewhere.
        await client.focus();
        if (client.url !== targetHref) {
          try {
            await client.navigate(targetHref);
          } catch {
            // navigate() can reject (e.g. cross-origin); focus alone is acceptable.
          }
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});

serwist.addEventListeners();

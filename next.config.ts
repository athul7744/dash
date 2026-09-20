import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * The app's own screens, precached so every section opens offline on a device
 * that has never visited it.
 *
 * Only `/` was precached before, and everything else was cached on visit — so a
 * URL you had not opened while online did not open at all, which is most of the
 * app on a fresh install. These are *shells*: the prerendered HTML holds no
 * rows, because every screen renders from local SQLite after hydration. Around
 * 6 KB each gzipped, and the list grows when an app is added, never when data
 * is. Data pages (a note, a day, an event) are deliberately absent — one URL per
 * row would be unbounded, and the service worker serves them from these instead.
 */
const APP_SHELLS = [
  "/",
  "/tasks",
  "/notes",
  "/day",
  // Bare `/tracker` only redirects, and a redirect is not something to cache;
  // the three views are prerendered by name instead.
  "/tracker/week",
  "/tracker/activity",
  "/tracker/mood",
  "/quotes",
  "/bookmarks",
  "/events",
  // The stand-in the service worker serves for any `/events/<id>` it has never
  // seen; the detail surface reads the real id off the URL.
  "/events/_",
  "/graph",
  "/trash",
];

/**
 * Changes every build, so a deployment replaces the cached shells rather than
 * leaving a device on last week's HTML.
 */
const SHELL_REVISION = `${Date.now()}`;

/**
 * Everything in `public/`, hashed.
 *
 * Supplying `additionalPrecacheEntries` *replaces* the plugin's own scan of this
 * directory rather than adding to it, so listing the shells without this would
 * quietly drop the icons and the web manifest from the precache — the files an
 * installed app needs most.
 */
function publicAssets(dir = path.join(process.cwd(), "public"), prefix = ""): { url: string; revision: string }[] {
  const skip = new Set(["sw.js", "sw.js.map"]);
  return readdirSync(dir).flatMap((name) => {
    if (prefix === "" && skip.has(name)) return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return publicAssets(full, `${prefix}${name}/`);
    return [{
      url: `/${prefix}${name}`,
      revision: createHash("md5").update(readFileSync(full)).digest("hex"),
    }];
  });
}

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB — covers PowerSync WASM files
  additionalPrecacheEntries: [
    ...APP_SHELLS.map((url) => ({ url, revision: SHELL_REVISION })),
    ...publicAssets(),
  ],
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The graph moved out of the notes app once it started mapping every app.
      // Kept so older bookmarks and installed shortcuts still land.
      { source: "/notes/graph", destination: "/graph", permanent: true },
    ];
  },
};

export default withSerwist(nextConfig);

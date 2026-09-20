import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB — covers PowerSync WASM files
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

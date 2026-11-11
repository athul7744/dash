import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["tests/setup/dom.ts"],
    include: ["tests/**/*.dom.test.ts", "tests/**/*.dom.test.tsx"],
    // These suites mount real Tiptap editors and dynamically import the editor
    // graph. A first import can exceed Vitest's 5s default while every file
    // runs in parallel, which surfaces as a spuriously timed-out test.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

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
  },
});

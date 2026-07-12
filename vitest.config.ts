import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // jsdom-only suites run under vitest.dom.config.ts; keep them out of the
    // node run (their include glob still matches *.dom.test.ts otherwise).
    exclude: [...configDefaults.exclude, "**/*.dom.test.{ts,tsx}"],
  },
});
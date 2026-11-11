/**
 * Stop `bun test` before it runs the wrong runner.
 *
 * Loaded from `bunfig.toml` for `bun test` only. These suites are Vitest
 * suites: module mocking depends on `vi.mock` hoisting, and the `.dom.test.*`
 * files need jsdom plus `tests/setup/dom.ts`. Bun's runner supplies neither, so
 * it reports hundreds of genuine-looking failures from tests that pass under
 * the configured runner.
 *
 * Failing fast with the working commands beats a wall of false failures. The
 * `bun run` scripts spawn Vitest and never load this file.
 */
console.error(
  [
    "",
    "`bun test` uses Bun's built-in runner. These are Vitest suites, so it",
    "would report failures that do not happen under the project's runner.",
    "",
    "  bun run test        both layers (node, then jsdom)",
    "  bun run test:node   node-based logic and write-path suites",
    "  bun run test:dom    jsdom integration suites",
    "  bun run test:watch  node suites in watch mode",
    "",
  ].join("\n"),
);

process.exit(1);

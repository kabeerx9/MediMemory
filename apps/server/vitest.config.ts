import { defineConfig } from "vitest/config";

// Two suites, split by what they cost to run:
//
//   pnpm test              pure unit tests — no network, no database
//   RUN_DB_TESTS=1 …       adds the Postgres transaction tests
//   pnpm eval              the model-policy evals (costs money, needs a key)
//
// Evals are excluded from the default project rather than merely skipped, so a
// plain `pnpm test` never even imports the AI SDK path.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "src/evals/**"],
  },
});

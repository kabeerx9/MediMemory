import { defineConfig } from "vitest/config";

// Model-policy evals only. Each case is a live model call, so they run
// sequentially with a long timeout rather than fanning out and tripping rate
// limits. Gated at the file level too (RUN_EVALS=1), so an accidental run is a
// no-op rather than a bill.
export default defineConfig({
  test: {
    include: ["src/evals/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

import { defineConfig } from "vitest/config";

// These integration tests start and dispose SDK native runtime workers. Keep their
// memory use bounded and allow cold worker startup independently of unit tests.
export default defineConfig({
  test: {
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

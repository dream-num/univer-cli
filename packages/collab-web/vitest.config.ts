import { defineConfig } from "vitest/config";

// The app under test renders straight into document/history, so run tests in jsdom.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"]
  }
});

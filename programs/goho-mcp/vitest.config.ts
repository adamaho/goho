import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test cold-starts the real MCP program, and importing it dominates the runtime. Cold
    // starts can take several seconds on a busy CI runner, too close to the 5s default.
    testTimeout: 15_000,
  },
});

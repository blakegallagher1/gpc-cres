import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    environment: "jsdom",
    pool: "threads",
    globals: true,
    setupFiles: ["./test-utils/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});

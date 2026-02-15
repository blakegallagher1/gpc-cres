import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "@entitlement-os/db": path.resolve(__dirname, "../../packages/db/dist"),
      "@entitlement-os/shared": path.resolve(__dirname, "../../packages/shared/src"),
      "@entitlement-os/openai": path.resolve(__dirname, "../../packages/openai/src"),
      "@entitlement-os/artifacts": path.resolve(__dirname, "../../packages/artifacts/src"),
      "@entitlement-os/evidence": path.resolve(__dirname, "../../packages/evidence/src"),
    },
  },
  test: {
    environment: "happy-dom",
    pool: "threads",
    globals: true,
    setupFiles: ["./test-utils/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});

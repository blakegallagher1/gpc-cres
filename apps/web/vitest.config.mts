import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const WEB_TEST_TIMEOUT_MS = 60_000;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "./"),
      "@/": path.resolve(appRoot, "./"),
      "@entitlement-os/db": path.resolve(appRoot, "../../packages/db/dist"),
      "@entitlement-os/shared": path.resolve(appRoot, "../../packages/shared/src"),
      "@entitlement-os/openai": path.resolve(appRoot, "../../packages/openai/src"),
      "@entitlement-os/artifacts": path.resolve(appRoot, "../../packages/artifacts/src"),
      "@entitlement-os/evidence": path.resolve(appRoot, "../../packages/evidence/src"),
    },
  },
  test: {
    environment: "happy-dom",
    pool: "threads",
    testTimeout: WEB_TEST_TIMEOUT_MS,
    globals: true,
    setupFiles: ["./test-utils/setup.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**", "**/production-verification*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage",
      include: ["app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts", "components/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.spec.ts",
        "**/__tests__/**",
        "**/test-utils/**",
        "e2e/**",
        "**/*.d.ts",
      ],
      thresholds: {
        statements: 32,
        branches: 27,
        functions: 28,
        lines: 33,
      },
    },
  },
});

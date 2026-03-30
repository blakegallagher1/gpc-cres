import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Root vitest config — provides path aliases so `pnpm vitest run` from
 * the repo root correctly resolves `@/` imports in apps/web test files.
 *
 * Per-package configs (apps/web/vitest.config.mts, packages/openai/vitest.config.ts, etc.)
 * are used when running `pnpm -C <pkg> test` directly.
 */
export default defineConfig({
  resolve: {
    alias: {
      // apps/web uses @/ → apps/web/
      "@/": path.resolve(__dirname, "apps/web/"),
      "@": path.resolve(__dirname, "apps/web"),
      // Monorepo package aliases
      "@entitlement-os/db": path.resolve(__dirname, "packages/db/dist"),
      "@entitlement-os/shared": path.resolve(__dirname, "packages/shared/src"),
      "@entitlement-os/openai": path.resolve(__dirname, "packages/openai/src"),
      "@entitlement-os/artifacts": path.resolve(__dirname, "packages/artifacts/src"),
      "@entitlement-os/evidence": path.resolve(__dirname, "packages/evidence/src"),
    },
  },
  test: {
    environment: "happy-dom",
    pool: "threads",
    globals: true,
    exclude: [
      "node_modules/**",
      "**/node_modules/**",
      ".claude/**",
      "**/.claude/**",
      ".next/**",
      "**/.next/**",
      "**/dist/**",
      "**/production-verification*",
      // e2e tests run via Playwright, not Vitest
      "apps/web/e2e/**",
    ],
    setupFiles: [path.resolve(__dirname, "apps/web/test-utils/setup.ts")],
  },
});

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "dist/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "**/*.test.ts", "**/*.d.ts", "dist/**"],
      thresholds: {
        statements: 35,
        branches: 25,
        functions: 34,
        lines: 37,
      },
    },
  },
});

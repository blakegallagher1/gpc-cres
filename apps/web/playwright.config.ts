import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    env: {
      NEXT_PUBLIC_E2E: "true",
      NEXT_PUBLIC_DISABLE_AUTH: "true",
    },
    port: 3000,
    // Deterministic E2E env: if we reuse an already-running dev server,
    // `NEXT_PUBLIC_*` build-time env may not match and UI state (Copilot/auth)
    // can diverge and cause flaky navigation.
    reuseExistingServer: false,
  },
});

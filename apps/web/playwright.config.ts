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
      NEXT_PUBLIC_DISABLE_AUTH: "true",
    },
    port: 3000,
    reuseExistingServer: true,
  },
});

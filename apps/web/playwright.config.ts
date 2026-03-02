import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load root .env so DATABASE_URL and other server vars are available
config({ path: resolve(__dirname, "../../.env") });

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
      ...process.env,
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

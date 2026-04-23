import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load root .env so DATABASE_URL and other server vars are available
config({ path: resolve(__dirname, "../../.env") });

// Playwright and pnpm force color in child processes during local runs. When
// Codex inherits NO_COLOR from the controller shell, Node emits a warning
// because that flag is already being ignored. Drop it only for this harness.
delete process.env.NO_COLOR;

const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const playwrightBaseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${playwrightPort}`;
const playwrightDatabaseUrl =
  process.env.PLAYWRIGHT_DATABASE_URL ??
  process.env.DATABASE_URL_LOCAL ??
  "postgresql://postgres:postgres@localhost:54323/entitlement_os?schema=public";
const playwrightDirectDatabaseUrl =
  process.env.PLAYWRIGHT_DIRECT_DATABASE_URL ??
  process.env.DIRECT_DATABASE_URL_LOCAL ??
  playwrightDatabaseUrl;
const playwrightAuthSecret =
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "test-auth-secret-for-playwright";
const playwrightLocalDevAuthOrgId =
  process.env.PLAYWRIGHT_LOCAL_DEV_AUTH_ORG_ID ??
  "00000000-0000-0000-0000-000000000001";
const playwrightLocalDevAuthUserId =
  process.env.PLAYWRIGHT_LOCAL_DEV_AUTH_USER_ID ??
  "00000000-0000-0000-0000-000000000003";
const playwrightEnableTemporal = process.env.PLAYWRIGHT_ENABLE_TEMPORAL ?? "false";
const playwrightReuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true";
const playwrightDistDir =
  process.env.PLAYWRIGHT_DIST_DIR ?? `.next-playwright-${playwrightPort}`;
const playwrightTsconfigPath =
  process.env.PLAYWRIGHT_TSCONFIG_PATH ?? `tsconfig.playwright.${playwrightPort}.json`;

function appendNodeOption(existing: string | undefined, option: string): string {
  if (!existing || existing.trim().length === 0) {
    return option;
  }
  if (existing.includes(option)) {
    return existing;
  }
  return `${existing} ${option}`;
}

// ---------------------------------------------------------------------------
// Shared env block — passed to webServer and available to test globalSetup
// ---------------------------------------------------------------------------
const sharedEnv: Record<string, string> = {
  DATABASE_URL: playwrightDatabaseUrl,
  DIRECT_DATABASE_URL: playwrightDirectDatabaseUrl,
  AUTH_SECRET: playwrightAuthSecret,
  NEXTAUTH_URL: playwrightBaseURL,
  NEXT_PUBLIC_APP_URL: playwrightBaseURL,
  LOCAL_DEV_AUTH_ORG_ID: playwrightLocalDevAuthOrgId,
  LOCAL_DEV_AUTH_USER_ID: playwrightLocalDevAuthUserId,
  ENABLE_TEMPORAL: playwrightEnableTemporal,
  NEXT_DIST_DIR: playwrightDistDir,
  NEXT_TSCONFIG_PATH: playwrightTsconfigPath,
  NEXT_PUBLIC_E2E: "true",
  NEXT_PUBLIC_DISABLE_AUTH: "true",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    "pk_test_ZW5qb3llZC1jYXRmaXNoLTMwLmNsZXJrLmFjY291bnRzLmRldiQ",
  // Next 16 currently emits DEP0060 from its bundled http-proxy dependency in
  // production-style E2E runs. Suppress only that upstream warning code here.
  NODE_OPTIONS: appendNodeOption(process.env.NODE_OPTIONS, "--disable-warning=DEP0060"),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "placeholder",
};

const webServerEnv = Object.fromEntries(
  Object.entries({
    ...process.env,
    ...sharedEnv,
  }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: 1,
  workers: 1,
  // Fail fast in CI — don't let a hung spec block the whole suite
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: playwrightBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Give Next.js pages time to hydrate before failing navigation
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  // ---------------------------------------------------------------------------
  // Named browser projects — Codex can target `--project chromium` etc.
  // Default runs chromium only; CI or explicit invocation can add more.
  // ---------------------------------------------------------------------------
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],

  webServer: {
    command: `cp tsconfig.json ${playwrightTsconfigPath} && pnpm build && PORT=${playwrightPort} pnpm start`,
    url: playwrightBaseURL,
    env: webServerEnv,
    // Use a dedicated production-style server for E2E runs so Playwright does
    // not contend with an already-running `next dev` lock in local sessions.
    // Set PLAYWRIGHT_REUSE_EXISTING_SERVER=true to skip the build and hit a
    // running dev server instead (faster iteration during development).
    reuseExistingServer: playwrightReuseExistingServer,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});

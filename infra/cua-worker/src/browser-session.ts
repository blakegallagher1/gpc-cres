/**
 * Browser session management using Playwright
 * Simplified port from @cua-sample/browser-runtime
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export type BrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  captureScreenshot: (label: string) => Promise<{
    path: string;
    capturedAt: string;
    url: string;
  }>;
  readState: () => Promise<{ currentUrl: string; pageTitle: string }>;
  close: () => Promise<void>;
};

/**
 * Launch a new browser session and navigate to the target URL
 */
export async function launchBrowserSession(options: {
  url: string;
  screenshotDir: string;
  headless?: boolean;
}): Promise<BrowserSession> {
  const viewport = DEFAULT_VIEWPORT;
  const browser = await chromium.launch({
    args: [`--window-size=${viewport.width},${viewport.height}`],
    headless: options.headless ?? true,
  });

  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  let screenshotCount = 0;

  // Navigate to the target URL
  await page.goto(options.url, { waitUntil: "load", timeout: 30_000 });

  // Utility to sanitize label for file path
  function sanitizeLabel(label: string): string {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "capture";
  }

  return {
    browser,
    context,
    page,

    async captureScreenshot(label: string) {
      screenshotCount += 1;
      await mkdir(options.screenshotDir, { recursive: true });

      const sanitized = sanitizeLabel(label);
      const path = join(
        options.screenshotDir,
        `${String(screenshotCount).padStart(3, "0")}-${sanitized}.png`,
      );

      await page.screenshot({ path });

      return {
        path,
        capturedAt: new Date().toISOString(),
        url: page.url(),
      };
    },

    async readState() {
      return {
        currentUrl: page.url(),
        pageTitle: await page.title(),
      };
    },

    async close() {
      await context.close();
      await browser.close();
    },
  };
}

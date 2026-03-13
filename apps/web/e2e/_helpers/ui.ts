import { expect, type Page } from "@playwright/test";

export async function ensureCopilotClosed(page: Page) {
  // Wait for the app shell to hydrate enough that the Copilot panel is mounted.
  // Without this, we can race the initial render and miss closing it in time.
  const toggleButton = page.getByRole("button", { name: /toggle copilot/i });
  const copilotAside = page
    .locator('aside:has(button[aria-label="Close Copilot"])')
    .first();
  const closeButton = page.getByRole("button", { name: /close copilot/i }).first();

  await toggleButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt++) {
    const closeVisible = await closeButton.isVisible().catch(() => false);
    const asideOpen = await copilotAside
      .evaluate((el) => el.classList.contains("translate-x-0"))
      .catch(() => false);

    if (!closeVisible && !asideOpen) {
      return;
    }

    if (closeVisible) {
      await closeButton.click({ force: true, timeout: 2_000 }).catch(async () => {
        await page.evaluate(() => {
          const el = document.querySelector<HTMLButtonElement>('button[aria-label="Close Copilot"]');
          el?.click();
        });
      });
    } else if ((await toggleButton.count()) > 0) {
      await toggleButton.click({ force: true, timeout: 2_000 }).catch(() => undefined);
    }

    const closed = await page
      .waitForFunction(() => {
        const button = document.querySelector<HTMLButtonElement>('button[aria-label="Close Copilot"]');
        const aside = button?.closest("aside");
        return !button || !aside || aside.classList.contains("translate-x-full");
      }, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    if (closed) {
      await page.waitForTimeout(150);
      return;
    }
  }

  // Give layout/transitions a brief moment to settle before we click underneath.
  await page.waitForTimeout(150);
}

export async function clickNavAndWaitForURL(
  page: Page,
  locatorOrHref: ReturnType<Page["locator"]> | string,
  expectedUrl: RegExp,
  opts?: { timeoutMs?: number }
) {
  const timeoutMs = opts?.timeoutMs ?? 30_000;

  // Copilot can open after initial hydration via stored UI state; close it again
  // right before navigation clicks to avoid pointer interception.
  await ensureCopilotClosed(page);

  const locator =
    typeof locatorOrHref === "string"
      ? page.locator(`a[href="${locatorOrHref}"]`).first()
      : locatorOrHref;

  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: "visible", timeout: timeoutMs });

  // Some dev builds have brief periods where the Next router isn't ready to
  // process client-side transitions; retry a few times with escalating click
  // strategies.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await Promise.all([
        page.waitForURL(expectedUrl, { timeout: timeoutMs, waitUntil: "commit" }),
        attempt === 0
          ? locator.click({ timeout: 5_000 })
          : attempt === 1
            ? locator.click({ force: true, timeout: 5_000 })
            : locator.evaluate((el) => (el as HTMLAnchorElement).click()),
      ]);
      return;
    } catch (err) {
      lastErr = err;
      await ensureCopilotClosed(page);
      await page.waitForTimeout(150);
    }
  }

  throw lastErr;
}

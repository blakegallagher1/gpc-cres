import { expect, type Page } from "@playwright/test";

export async function ensureCopilotClosed(page: Page) {
  // Wait for the app shell to hydrate enough that the Copilot panel is mounted.
  // Without this, we can race the initial render and miss closing it in time.
  const toggleButton = page.getByRole("button", { name: /toggle copilot/i });
  if ((await toggleButton.count()) > 0) {
    await toggleButton
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => undefined);
  }

  // If the panel is currently open (translate-x-0), it can intercept clicks.
  // Prefer closing via the toggle button (always in the header/viewport).
  const copilotAside = page
    .locator('aside:has(button[aria-label="Close Copilot"])')
    .first();
  if ((await copilotAside.count()) > 0 && (await toggleButton.count()) > 0) {
    const isOpen = await copilotAside
      .evaluate((el) => el.classList.contains("translate-x-0"))
      .catch(() => false);
    if (isOpen) {
      try {
        await toggleButton.click({ timeout: 2_000 });
      } catch {
        await toggleButton.click({ force: true, timeout: 2_000 });
      }
      await expect(copilotAside).toHaveClass(/translate-x-full/, { timeout: 10_000 }).catch(() => undefined);
      // Continue; some builds keep the close button in DOM briefly during animation.
    }
  }

  // Fallback: close button click (sometimes present when open).
  const closeButton = page.getByRole("button", { name: /close copilot/i }).first();
  if ((await closeButton.count()) === 0) return;
  if (!(await closeButton.isVisible().catch(() => false))) return;

  // Use a DOM click to avoid viewport/pointer-intercept flakiness.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLButtonElement>('button[aria-label="Close Copilot"]');
    el?.click();
  });

  // Best-effort: don't fail tests if the panel uses animations or keeps a hidden
  // close button around in the DOM.
  await expect(closeButton).toBeHidden({ timeout: 5_000 }).catch(() => undefined);

  // Give layout/transitions a brief moment to settle before we click underneath.
  await page.waitForTimeout(100);
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

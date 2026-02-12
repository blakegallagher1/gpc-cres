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

  const panel = page.locator("aside").filter({ hasText: "Copilot" }).first();
  if ((await panel.count()) === 0) return;

  const isOpen = await panel
    .evaluate((el) => el.classList.contains("translate-x-0"))
    .catch(() => false);
  if (!isOpen) return;

  const closeButton = panel.getByRole("button", { name: /close copilot/i });
  if ((await closeButton.count()) > 0) {
    await closeButton.click();
  } else if ((await toggleButton.count()) > 0) {
    // Fallback: toggle it closed.
    await toggleButton.click();
  } else {
    // Fallback for older builds without aria-label.
    await panel.locator("button").first().click();
  }

  await expect(panel).toHaveClass(/translate-x-full/);
}

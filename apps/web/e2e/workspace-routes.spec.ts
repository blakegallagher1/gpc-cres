import { expect, test } from "@playwright/test";
import { clickNavAndWaitForURL, ensureCopilotClosed } from "./_helpers/ui";

test.describe("Workspace routes", () => {
  test("preserves the deals pathname through hydration", async ({ page }) => {
    await page.goto("/deals", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await expect(page.locator('[data-route-id="deals"]')).toHaveAttribute(
      "data-route-path",
      "/deals",
    );
    await expect(
      page.getByLabel("Deals workspace").getByRole("heading", { name: "Deals", level: 1 }),
    ).toBeVisible();
    await expect(page.locator('a[href="/deals"][aria-current="page"]').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/deals");
  });

  test("keeps sidebar navigation stable across chat, deals, and map", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await clickNavAndWaitForURL(page, "/deals", /\/deals/, { timeoutMs: 30_000 });
    await expect(page.locator('[data-route-id="deals"]')).toHaveAttribute(
      "data-route-path",
      "/deals",
    );

    await clickNavAndWaitForURL(page, "/map", /\/map/, { timeoutMs: 30_000 });
    await expect(page.locator('[data-route-id="map"]')).toHaveAttribute("data-route-path", "/map");
    await expect(page.getByRole("heading", { name: "Map workspace", level: 1 })).toBeVisible();

    await clickNavAndWaitForURL(page, "/chat", /\/chat/, { timeoutMs: 30_000 });
    await expect(page.locator('a[href="/chat"][aria-current="page"]').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe("/chat");
  });
});

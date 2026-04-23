import { test, expect } from "@playwright/test";
import { clickNavAndWaitForURL, ensureCopilotClosed } from "./_helpers/ui";

test.describe("Navigation", () => {
  test("should display public homepage with company overview", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /enter the platform/i })).toBeVisible();
  });

  test("should navigate to Agent Library", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await clickNavAndWaitForURL(page, "/agents", /\/agents/, { timeoutMs: 30_000 });
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should navigate to Automation", async ({ page }) => {
    await page.goto("/automation", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await expect(page.getByText("Automation Dashboard").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should navigate to Run History", async ({ page }) => {
    await page.goto("/runs", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await expect(page.getByText("Run History").first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("should navigate to Command Center", async ({ page }) => {
    await page.goto("/command-center", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await expect(page.getByText("Command Center").first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Command Palette", () => {
  test("should open with keyboard shortcut", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    await expect(
      page.getByPlaceholder(/search deals.*commands/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("should navigate via command palette", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/search deals.*commands/i);
    await input.waitFor({ state: "visible", timeout: 10_000 });
    await input.fill("agents");
    await page.getByText("Go to Agent Library").first().click();
    await expect(page).toHaveURL(/\/agents/);
  });
});

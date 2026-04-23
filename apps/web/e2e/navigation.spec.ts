import { test, expect } from "@playwright/test";
import { clickNavAndWaitForURL, ensureCopilotClosed } from "./_helpers/ui";

test.describe("Navigation", () => {
  test("should display public homepage with company overview", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // The homepage is the public marketing shell — verify key visible content
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /enter the platform/i })).toBeVisible();
  });

  test("should navigate to Agent Library", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await clickNavAndWaitForURL(page, "/agents", /\/agents/, { timeoutMs: 30_000 });
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible();
  });

  test("should navigate to Automation", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await clickNavAndWaitForURL(page, "/automation", /\/automation/, { timeoutMs: 30_000 });
    await expect(page.getByRole("heading", { name: "Automation Dashboard", level: 1 })).toBeVisible();
  });

  test("should navigate to Run History", async ({ page }) => {
    // /runs is not in the sidebar — navigate directly
    await page.goto("/runs", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Run History", level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("should navigate to Command Center", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await clickNavAndWaitForURL(page, "/command-center", /\/command-center/, {
      timeoutMs: 30_000,
    });
    await expect(page.getByText("Command Center")).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Command Palette", () => {
  test("should open with keyboard shortcut", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible();
  });

  test("should navigate via command palette", async ({ page }) => {
    await page.goto("/chat", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search...").fill("agents");
    await page.getByText("Go to Agent Library").first().click();
    await expect(page).toHaveURL(/\/agents/);
  });
});

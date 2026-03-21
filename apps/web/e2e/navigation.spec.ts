import { test, expect } from "@playwright/test";
import { clickNavAndWaitForURL, ensureCopilotClosed } from "./_helpers/ui";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
  });

  test("should display BUY / BUILD / MANAGE poster homepage", async ({ page }) => {
    await expect(page.getByText("BUY")).toBeVisible();
    await expect(page.getByText("BUILD")).toBeVisible();
    await expect(page.getByText("MANAGE")).toBeVisible();
    await expect(page.getByRole("link", { name: /enter entitlement os/i })).toBeVisible();
  });

  test("should navigate to Agent Library", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/agents", /\/agents/, { timeoutMs: 30_000 });
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible();
  });

  test("should navigate to Automation", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/automation", /\/automation/, { timeoutMs: 30_000 });
    await expect(page.getByRole("heading", { name: "Automation Dashboard", level: 1 })).toBeVisible();
  });

  test("should navigate to Run History", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/runs", /\/runs/, { timeoutMs: 30_000 });
    await expect(page.getByText("Run History")).toBeVisible();
  });

  test("should navigate to Deploy", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/deploy", /\/deploy/, { timeoutMs: 30_000 });
    await expect(page.getByText("Deployment Channels")).toBeVisible();
  });

  test("should navigate to Command Center", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/command-center", /\/command-center/, {
      timeoutMs: 30_000,
    });
    await expect(page.getByRole("heading", { name: "Command Center", level: 1 })).toBeVisible({
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

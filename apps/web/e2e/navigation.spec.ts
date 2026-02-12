import { test, expect } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await ensureCopilotClosed(page);
  });

  test("should display chat on homepage", async ({ page }) => {
    await expect(
      page.getByPlaceholder("Ask about parcels, deals, zoning...")
    ).toBeVisible();
  });

  test("should navigate to Agent Library", async ({ page }) => {
    await page.getByRole("link", { name: /agents/i }).click();
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible();
  });

  test("should navigate to Workflows", async ({ page }) => {
    await page.getByRole("link", { name: /workflows/i }).click();
    await expect(page).toHaveURL(/\/workflows/);
    await expect(page.getByRole("heading", { name: "Workflows", level: 1 })).toBeVisible();
  });

  test("should navigate to Run History", async ({ page }) => {
    await page.getByRole("link", { name: /runs/i }).click();
    await expect(page).toHaveURL(/\/runs/);
    await expect(page.getByText("Run History")).toBeVisible();
  });

  test("should navigate to Deploy", async ({ page }) => {
    await page.getByRole("link", { name: /deploy/i }).click();
    await expect(page).toHaveURL(/\/deploy/);
    await expect(page.getByText("Deployment Channels")).toBeVisible();
  });

  test("should navigate to Command Center", async ({ page }) => {
    await page.getByRole("link", { name: /command center/i }).click();
    // Next dev compiles routes on-demand; allow extra time under parallel load.
    await expect(page).toHaveURL(/\/command-center/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Command Center", level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("Command Palette", () => {
  test("should open with keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible();
  });

  test("should navigate via command palette", async ({ page }) => {
    await page.goto("/");
    await ensureCopilotClosed(page);
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search...").fill("agents");
    await page.getByText("Go to Agent Library").click();
    await expect(page).toHaveURL(/\/agents/);
  });
});

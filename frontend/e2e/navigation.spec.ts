import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should display dashboard on homepage", async ({ page }) => {
    await expect(page).toHaveTitle(/GPC Dashboard|Dashboard/);
    await expect(page.getByText("Total Runs (24h)")).toBeVisible();
    await expect(page.getByText("Active Agents")).toBeVisible();
  });

  test("should navigate to Agent Library", async ({ page }) => {
    await page.getByRole("link", { name: /agents/i }).click();
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.getByText("Agent Library")).toBeVisible();
  });

  test("should navigate to Workflows", async ({ page }) => {
    await page.getByRole("link", { name: /workflows/i }).click();
    await expect(page).toHaveURL(/\/workflows/);
    await expect(page.getByText("Workflows")).toBeVisible();
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

  test("should navigate to Settings", async ({ page }) => {
    await page.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByText("Settings")).toBeVisible();
  });
});

test.describe("Command Palette", () => {
  test("should open with keyboard shortcut", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await expect(page.getByPlaceholder("Type a command or search...")).toBeVisible();
  });

  test("should navigate via command palette", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    await page.getByPlaceholder("Type a command or search...").fill("agents");
    await page.getByText("Go to Agent Library").click();
    await expect(page).toHaveURL(/\/agents/);
  });
});

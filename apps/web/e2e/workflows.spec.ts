import { test, expect } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/automation?tab=builder", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
  });

  test("should display builder workflow list", async ({ page }) => {
    await expect(page.getByText("Automation Dashboard").first()).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("tab", { name: "Builder" }).click();
    await expect(page.getByText("Workflow list").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /^New$/ })).toBeVisible();
  });

  test("should load workflow editor", async ({ page }) => {
    await page.goto("/automation?tab=builder", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByRole("tab", { name: "Builder" }).click();
    await expect(page).toHaveURL(/\/automation\?tab=builder/);
    await expect(page.getByText("Builder").first()).toBeVisible();
  });

  test("should display workflow builder canvas", async ({ page }) => {
    await page.goto("/automation?tab=builder", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByRole("tab", { name: "Builder" }).click();

    await expect(page.getByText("Builder").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /run workflow/i })).toBeVisible();
  });

  test("legacy /workflows route should redirect to automation builder", async ({ page }) => {
    await page.goto("/workflows", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/automation\?tab=builder/);
  });
});

test.describe("Workflow Detail", () => {
  test("legacy /workflows/:id route should redirect to automation builder with workflow query", async ({ page }) => {
    await page.goto("/workflows/wf_001", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/automation(\?|.*tab=builder.*workflow=wf_001)/);
  });
});

import { test, expect } from "@playwright/test";

test.describe("Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workflows");
  });

  test("should display workflows list", async ({ page }) => {
    await expect(page.getByText("Workflows")).toBeVisible();
    await expect(page.getByRole("button", { name: /create workflow/i })).toBeVisible();
  });

  test("should navigate to workflow builder", async ({ page }) => {
    await page.getByRole("button", { name: /create workflow/i }).click();
    await expect(page).toHaveURL(/\/workflows\/new/);
    await expect(page.getByText("Workflow Builder")).toBeVisible();
  });

  test("should display workflow builder canvas", async ({ page }) => {
    await page.goto("/workflows/new");
    
    // Check for canvas and controls
    await expect(page.getByText("Agent Palette")).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /validate/i })).toBeVisible();
  });

  test("should show validation errors", async ({ page }) => {
    await page.goto("/workflows/new");
    await page.getByRole("button", { name: /validate/i }).click();
    
    await expect(page.getByText(/workflow must have a start node/i)).toBeVisible();
  });
});

test.describe("Workflow Detail", () => {
  test("should display workflow details", async ({ page }) => {
    await page.goto("/workflows/wf_001");
    
    await expect(page.getByText("Property Analysis Pipeline")).toBeVisible();
    await expect(page.getByText("Edit")).toBeVisible();
    await expect(page.getByText("Run")).toBeVisible();
  });

  test("should run workflow", async ({ page }) => {
    await page.goto("/workflows/wf_001");
    await page.getByRole("button", { name: /run/i }).click();
    
    await expect(page.getByText("Run Workflow")).toBeVisible();
    await expect(page.getByRole("button", { name: /start run/i })).toBeVisible();
  });
});

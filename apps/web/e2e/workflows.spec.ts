import { test, expect } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/workflows");
    await ensureCopilotClosed(page);
  });

  test("should display workflows list", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Workflows", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /create workflow/i }).first()).toBeVisible();
  });

  test("should load workflow editor", async ({ page }) => {
    await page.goto("/workflows/new");
    await ensureCopilotClosed(page);
    await expect(page).toHaveURL(/\/workflows\/new/);
    await expect(page.getByText("Agent Palette")).toBeVisible();
  });

  test("should display workflow builder canvas", async ({ page }) => {
    await page.goto("/workflows/new");
    await ensureCopilotClosed(page);
    
    // Check for canvas and controls
    await expect(page.getByText("Agent Palette")).toBeVisible();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Run$/ })).toBeVisible();
  });

  test("should prevent running an unsaved workflow", async ({ page }) => {
    await page.goto("/workflows/new");
    await ensureCopilotClosed(page);
    await page.getByRole("button", { name: /^Run$/ }).click();
    
    await expect(page.getByText(/save the workflow before running/i)).toBeVisible();
  });
});

test.describe("Workflow Detail", () => {
  test("should show not found state for unknown workflow id", async ({ page }) => {
    await page.goto("/workflows/wf_001");

    await expect(page.getByRole("heading", { name: "Workflow not found", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to workflows/i })).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Agent Library", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await ensureCopilotClosed(page);
  });

  test("should display all agents", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible();
    await expect(page.getByText(/specialized agents available/i)).toBeVisible();
    
    // Check for some known agents
    await expect(page.getByRole("heading", { name: "Coordinator", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Legal", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Research", exact: true })).toBeVisible();
  });

  test("should filter agents by search", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search agents...");
    await searchInput.fill("research");
    
    await expect(page.getByRole("heading", { name: "Research", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Coordinator", exact: true })).not.toBeVisible();
  });

  test("should filter agents by status", async ({ page }) => {
    const statusFilter = page
      .getByRole("combobox")
      .filter({ hasText: /all status/i })
      .first();

    await statusFilter.click();
    await page.getByRole("option", { name: "Active", exact: true }).click();
    
    await expect(page.getByRole("heading", { name: "Coordinator", exact: true })).toBeVisible();
  });

  test("should navigate to agent detail page", async ({ page }) => {
    await page.locator('a[href="/agents/coordinator"]').click();
    // Next dev compiles routes on-demand; under parallel load this navigation can take >5s.
    await expect(page).toHaveURL(/\/agents\/coordinator/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Coordinator", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tools" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Runs" })).toBeVisible();
  });

  test("should run agent from detail page", async ({ page }) => {
    await page.goto("/agents/coordinator");
    await ensureCopilotClosed(page);
    await page.getByRole("button", { name: /^Run Agent$/ }).first().click();
    
    await expect(page.getByRole("heading", { name: /run coordinator/i })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your query...")).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";

test.describe("Agent Library", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
  });

  test("should display all agents", async ({ page }) => {
    await expect(page.getByText("Agent Library")).toBeVisible();
    await expect(page.getByText("8 agents")).toBeVisible();
    
    // Check for some known agents
    await expect(page.getByText("Coordinator")).toBeVisible();
    await expect(page.getByText("Market Research")).toBeVisible();
    await expect(page.getByText("Financial Analyst")).toBeVisible();
  });

  test("should filter agents by search", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search agents...");
    await searchInput.fill("research");
    
    await expect(page.getByText("Market Research")).toBeVisible();
    await expect(page.getByText("Coordinator")).not.toBeVisible();
  });

  test("should filter agents by capability", async ({ page }) => {
    await page.getByRole("combobox").first().click();
    await page.getByText("Research").click();
    
    await expect(page.getByText("Market Research")).toBeVisible();
  });

  test("should navigate to agent detail page", async ({ page }) => {
    await page.getByText("Coordinator").first().click();
    await expect(page).toHaveURL(/\/agents\/coordinator/);
    await expect(page.getByText("Overview")).toBeVisible();
    await expect(page.getByText("Tools")).toBeVisible();
    await expect(page.getByText("Runs")).toBeVisible();
  });

  test("should run agent from detail page", async ({ page }) => {
    await page.goto("/agents/coordinator");
    await page.getByRole("button", { name: /run agent/i }).click();
    
    await expect(page.getByText("Run Agent")).toBeVisible();
    await expect(page.getByPlaceholder("Enter your prompt...")).toBeVisible();
  });
});

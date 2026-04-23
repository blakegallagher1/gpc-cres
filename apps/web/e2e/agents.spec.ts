import { test, expect } from "@playwright/test";
import { clickNavAndWaitForURL, ensureCopilotClosed } from "./_helpers/ui";

test.describe("Agent Library", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
  });

  test("should display all agents", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Agent Library", level: 1 })).toBeVisible();
    // Verify at least one agent card is rendered
    await expect(page.getByRole("heading", { name: "EntitlementOS Cartographer", exact: true })).toBeVisible();
  });

  test("should filter agents by search", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Search agents...");
    // The single agent matches on description text containing "entitlement"
    await searchInput.fill("entitlement");

    await expect(page.getByRole("heading", { name: "EntitlementOS Cartographer", exact: true })).toBeVisible();
  });

  test("should filter agents by status", async ({ page }) => {
    // Find the status filter — the second combobox (first is model filter)
    const statusFilter = page
      .getByRole("combobox")
      .nth(1);

    await statusFilter.click();
    await page.getByRole("option", { name: "Active", exact: true }).click();

    await expect(page.getByRole("heading", { name: "EntitlementOS Cartographer", exact: true })).toBeVisible();
  });

  test("should navigate to agent detail page", async ({ page }) => {
    await clickNavAndWaitForURL(page, "/agents/coordinator", /\/agents\/coordinator/, {
      timeoutMs: 30_000,
    });
    await expect(page.getByRole("heading", { name: "EntitlementOS Cartographer", level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tools" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Runs" })).toBeVisible();
  });

  test("should run agent from detail page", async ({ page }) => {
    await page.goto("/agents/coordinator", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);
    await page.getByRole("button", { name: /^Run Agent$/ }).first().click();

    await expect(page.getByRole("heading", { name: /run entitlementos cartographer/i })).toBeVisible();
    await expect(page.getByPlaceholder("Enter your query...")).toBeVisible();
  });
});

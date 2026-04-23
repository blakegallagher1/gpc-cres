import { test, expect } from "@playwright/test";
import { ensureCopilotClosed } from "./_helpers/ui";

test.describe("Command Center KPI Smoke", () => {
  test("should render entitlement KPI widget with median days and trend chart", async ({ page }) => {
    await page.route("**/api/intelligence/daily-briefing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          summary: "Test briefing summary.",
          sections: {
            newActivity: { label: "New Activity", items: [] },
            needsAttention: { label: "Needs Attention", items: [] },
            automationActivity: { label: "Automation Activity", items: [] },
            pipelineSnapshot: {
              label: "Pipeline Snapshot",
              stages: [
                { status: "INTAKE", count: 1 },
                { status: "TRIAGE_DONE", count: 0 },
              ],
            },
          },
        }),
      });
    });

    // Make the KPI widget deterministic regardless of local DB/auth state.
    await page.route("**/api/jurisdictions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jurisdictions: [{ id: "jur_ebr", name: "East Baton Rouge Parish" }],
        }),
      });
    });

    await page.route("**/api/intelligence/entitlements?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("view") !== "kpi") return route.fallback();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sampleSize: 42,
          matchedPredictionCount: 12,
          medianDecisionDays: 46,
          medianTimelineAbsoluteErrorDays: 11,
          meanTimelineAbsoluteErrorDays: 13,
          approvalCalibrationGap: 0.08,
          trend: [
            {
              month: "2025-11",
              sampleSize: 10,
              medianDecisionDays: 48,
              medianTimelineAbsoluteErrorDays: 12,
              approvalCalibrationGap: 0.1,
            },
            {
              month: "2025-12",
              sampleSize: 14,
              medianDecisionDays: 46,
              medianTimelineAbsoluteErrorDays: 11,
              approvalCalibrationGap: 0.08,
            },
            {
              month: "2026-01",
              sampleSize: 18,
              medianDecisionDays: 44,
              medianTimelineAbsoluteErrorDays: 10,
              approvalCalibrationGap: 0.06,
            },
          ],
          byStrategy: [
            {
              strategyKey: "rezoning",
              strategyLabel: "Rezoning",
              sampleSize: 9,
              medianTimelineAbsoluteErrorDays: 13,
              approvalCalibrationGap: 0.12,
            },
          ],
        }),
      });
    });

    await page.goto("/command-center", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    // The command-center hero uses an eyebrow paragraph, not an h1, for the label.
    await expect(page.getByText("Command Center").first()).toBeVisible();

    await expect(page.getByText("Entitlement KPI Monitor")).toBeVisible();
    await expect(page.getByText("Median Entitlement Days")).toBeVisible();
    await expect(page.getByText("46d")).toBeVisible();

    // Trend chart container should be present when trend data is supplied.
    await expect(page.getByText("Monthly Trend")).toBeVisible();
    await expect(page.locator(".recharts-wrapper")).toBeVisible();
  });

  test("hands priority context into chat mission control", async ({ page }) => {
    await page.route("**/api/intelligence/daily-briefing", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          summary: "One queue item needs intervention.",
          sections: {
            newActivity: { label: "New Activity", items: [] },
            needsAttention: {
              label: "Needs Attention",
              items: [
                {
                  title: "Variance package incomplete",
                  dealId: "deal-1",
                  dealName: "Airline Yard",
                  reason: "Missing the stormwater memo before submission.",
                },
              ],
            },
            automationActivity: { label: "Automation Activity", items: [] },
            pipelineSnapshot: {
              label: "Pipeline Snapshot",
              stages: [{ status: "INTAKE", count: 1 }],
            },
          },
        }),
      });
    });

    await page.route("**/api/portfolio", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          deals: [{ status: "INTAKE", updatedAt: new Date().toISOString() }],
          metrics: { totalDeals: 1, byStatus: { INTAKE: 1 } },
        }),
      });
    });

    await page.route("**/api/intelligence/deadlines", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 0, deadlines: [] }),
      });
    });

    await page.route("**/api/opportunities?limit=6", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 0, opportunities: [] }),
      });
    });

    await page.route("**/api/jurisdictions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jurisdictions: [] }),
      });
    });

    await page.route("**/api/intelligence/entitlements?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sampleSize: 0,
          matchedPredictionCount: 0,
          medianDecisionDays: null,
          medianTimelineAbsoluteErrorDays: null,
          meanTimelineAbsoluteErrorDays: null,
          approvalCalibrationGap: null,
          trend: [],
          byStrategy: [],
        }),
      });
    });

    await page.route("**/api/auth/token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "test-token" }),
      });
    });

    await page.route("**/api/chat/conversations", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversations: [] }),
      });
    });

    await page.goto("/command-center", { waitUntil: "domcontentloaded" });
    await ensureCopilotClosed(page);

    await page.getByRole("button", { name: "Launch mission" }).first().click();

    await expect(page).toHaveURL(/\/chat/);
    await expect(page.getByText("Attached working context")).toBeVisible();
    await expect(page.getByText("Variance package incomplete")).toBeVisible();
    await expect(
      page.getByText("Airline Yard: Missing the stormwater memo before submission."),
    ).toBeVisible();
  });
});

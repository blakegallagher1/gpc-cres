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

    await expect(
      page.getByRole("heading", { name: "Command Center", level: 1 }),
    ).toBeVisible();

    await expect(page.getByText("Entitlement KPI Monitor")).toBeVisible();
    await expect(page.getByText("Median Entitlement Days")).toBeVisible();
    await expect(page.getByText("46d")).toBeVisible();

    // Trend chart container should be present when trend data is supplied.
    await expect(page.getByText("Monthly Trend")).toBeVisible();
    await expect(page.locator(".recharts-wrapper")).toBeVisible();
  });
});

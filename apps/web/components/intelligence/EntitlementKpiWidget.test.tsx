import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { EntitlementKpiWidget } from "@/components/intelligence/EntitlementKpiWidget";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("EntitlementKpiWidget", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  function renderWidget() {
    return render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <EntitlementKpiWidget />
      </SWRConfig>,
    );
  }

  it("loads jurisdictions and renders KPI trend data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/jurisdictions")) {
        return jsonResponse({
          jurisdictions: [
            { id: "jur-1", name: "East Baton Rouge" },
          ],
        });
      }
      if (url.startsWith("/api/intelligence/entitlements?view=kpi")) {
        return jsonResponse({
          sampleSize: 19,
          matchedPredictionCount: 12,
          medianDecisionDays: 46,
          medianTimelineAbsoluteErrorDays: 11,
          meanTimelineAbsoluteErrorDays: 13.2,
          approvalCalibrationGap: -0.06,
          trend: [
            {
              month: "2025-10",
              sampleSize: 6,
              medianDecisionDays: 48,
              medianTimelineAbsoluteErrorDays: 12,
              approvalCalibrationGap: -0.05,
            },
            {
              month: "2025-11",
              sampleSize: 7,
              medianDecisionDays: 46,
              medianTimelineAbsoluteErrorDays: 11,
              approvalCalibrationGap: -0.06,
            },
          ],
          byStrategy: [
            {
              strategyKey: "rezoning",
              strategyLabel: "Rezoning",
              sampleSize: 8,
              medianTimelineAbsoluteErrorDays: 10,
              approvalCalibrationGap: -0.04,
            },
          ],
        });
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    renderWidget();

    expect(await screen.findByText("Entitlement KPI Monitor")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/jurisdictions");
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/intelligence/entitlements?view=kpi&jurisdictionId=jur-1"),
      );
    });

    expect(await screen.findByText("46d")).toBeInTheDocument();
    expect(await screen.findByText("11d")).toBeInTheDocument();
    expect(await screen.findByText("-0.06")).toBeInTheDocument();
    expect(await screen.findByText("Monthly Trend")).toBeInTheDocument();
    expect(await screen.findByText("By Strategy")).toBeInTheDocument();
    expect(await screen.findByText("Rezoning")).toBeInTheDocument();
  });

  it("shows a retryable jurisdiction error state", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/jurisdictions")) {
        return jsonResponse({ error: "gateway failure" }, 500);
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    renderWidget();

    expect(await screen.findByText("Unable to load jurisdictions.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/jurisdictions");
    });
  });

  it("normalizes KPI query failures into a friendly retry state", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/jurisdictions")) {
        return jsonResponse({
          jurisdictions: [{ id: "jur-1", name: "East Baton Rouge" }],
        });
      }
      if (url.startsWith("/api/intelligence/entitlements?view=kpi")) {
        return jsonResponse({ error: "Invalid query parameters" }, 400);
      }
      return jsonResponse({ error: "Not found" }, 404);
    });

    renderWidget();

    expect(await screen.findByText("Unable to load entitlement KPI monitor.")).toBeInTheDocument();
    expect(screen.queryByText("Invalid query parameters")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

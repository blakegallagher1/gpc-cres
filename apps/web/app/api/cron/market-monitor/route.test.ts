import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runMarketMonitoringMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runMarketMonitoringMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@/lib/automation/marketMonitoring", () => ({
  runMarketMonitoring: runMarketMonitoringMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
  serializeErrorForLogs: serializeErrorForLogsMock,
}));

import { GET } from "./route";

describe("GET /api/cron/market-monitor", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    runMarketMonitoringMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/market-monitor", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runMarketMonitoringMock).not.toHaveBeenCalled();
  });

  it("returns the monitoring summary on success", async () => {
    runMarketMonitoringMock.mockResolvedValue({
      ok: true,
      marketsChecked: 12,
      anomalies: 1,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/market-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      marketsChecked: 12,
      anomalies: 1,
    });
  });

  it("captures and reports failures", async () => {
    const error = new Error("upstream timed out");
    runMarketMonitoringMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/market-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to run market monitor",
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.market-monitor", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Cron market-monitor failed",
      { message: "upstream timed out" },
    );
  });
});
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runDriftMonitorMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runDriftMonitorMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/drift-monitor.service", () => ({
  runDriftMonitor: runDriftMonitorMock,
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

describe("GET /api/cron/drift-monitor", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    runDriftMonitorMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();
    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/drift-monitor", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runDriftMonitorMock).not.toHaveBeenCalled();
  });

  it("delegates to runDriftMonitor and returns summary", async () => {
    const mockSummary = {
      success: true as const,
      segmentsChecked: 2,
      frozenSegments: 1,
      results: [
        { segmentId: "seg-1", frozen: false, consecutiveWorsenings: 1 },
        { segmentId: "seg-3", frozen: true, consecutiveWorsenings: 3 },
      ],
    };
    runDriftMonitorMock.mockResolvedValue(mockSummary);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/drift-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockSummary);
    expect(runDriftMonitorMock).toHaveBeenCalledOnce();
  });

  it("returns 500 when service throws", async () => {
    const error = new Error("db unavailable");
    runDriftMonitorMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/drift-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.drift-monitor", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("Cron drift-monitor failed", {
      message: "db unavailable",
    });
  });
});

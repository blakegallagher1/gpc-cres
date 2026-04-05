import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  calibrationSegmentFindManyMock,
  trackDriftMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  calibrationSegmentFindManyMock: vi.fn(),
  trackDriftMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    calibrationSegment: {
      findMany: calibrationSegmentFindManyMock,
    },
  },
}));

vi.mock("@/lib/services/driftFreezeService", () => ({
  trackDrift: trackDriftMock,
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
    calibrationSegmentFindManyMock.mockReset();
    trackDriftMock.mockReset();
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
    expect(calibrationSegmentFindManyMock).not.toHaveBeenCalled();
  });

  it("tracks drift for segments with MAE values", async () => {
    calibrationSegmentFindManyMock.mockResolvedValue([
      { id: "seg-1", orgId: "org-1", mae: 0.18 },
      { id: "seg-2", orgId: "org-1", mae: null },
      { id: "seg-3", orgId: "org-2", mae: 0.42 },
    ]);
    trackDriftMock
      .mockResolvedValueOnce({ frozen: false, consecutiveWorsenings: 1 })
      .mockResolvedValueOnce({ frozen: true, consecutiveWorsenings: 3 });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/drift-monitor", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      segmentsChecked: 2,
      frozenSegments: 1,
      results: [
        { segmentId: "seg-1", frozen: false, consecutiveWorsenings: 1 },
        { segmentId: "seg-3", frozen: true, consecutiveWorsenings: 3 },
      ],
    });
    expect(trackDriftMock).toHaveBeenNthCalledWith(1, "org-1", "seg-1", 0.18);
    expect(trackDriftMock).toHaveBeenNthCalledWith(2, "org-2", "seg-3", 0.42);
  });

  it("captures failures and returns 500", async () => {
    const error = new Error("db unavailable");
    calibrationSegmentFindManyMock.mockRejectedValue(error);

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
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runChangeDetectionMock,
  runWithCronMonitorMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runChangeDetectionMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/change-detection.service", () => ({
  runChangeDetection: runChangeDetectionMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
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

describe("GET /api/cron/change-detection", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    runChangeDetectionMock.mockReset();
    runWithCronMonitorMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    runWithCronMonitorMock.mockImplementation(({ handler }: { handler: () => Promise<Response> }) =>
      handler(),
    );
    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runWithCronMonitorMock).not.toHaveBeenCalled();
    expect(runChangeDetectionMock).not.toHaveBeenCalled();
  });

  it("returns an empty summary from runChangeDetection when no changes are found", async () => {
    const summary = {
      ok: true,
      message: "No active seed sources to monitor",
      stats: {
        total: 0,
        changed: 0,
        firstCaptures: 0,
        unreachable: 0,
        tasksCreated: 0,
        networkAlert: false,
      },
    };
    runChangeDetectionMock.mockResolvedValue(summary);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "change-detection",
        schedule: "0 6 * * *",
      }),
    );
  });

  it("returns a populated summary from runChangeDetection when changes are detected", async () => {
    const summary = {
      ok: true,
      message: "Change detection complete",
      stats: {
        total: 1,
        changed: 1,
        firstCaptures: 0,
        unreachable: 0,
        tasksCreated: 1,
        networkAlert: false,
      },
    };
    runChangeDetectionMock.mockResolvedValue(summary);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(runChangeDetectionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and captures exceptions when runChangeDetection throws", async () => {
    const error = new Error("change detection failed");
    runChangeDetectionMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Change detection failed",
      details: "Error: change detection failed",
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.change-detection", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("Cron change-detection failed", {
      message: "change detection failed",
    });
  });
});

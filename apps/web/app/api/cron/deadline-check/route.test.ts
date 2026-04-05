import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runDeadlineMonitoringMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runDeadlineMonitoringMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@/lib/automation/deadlineMonitoring", () => ({
  runDeadlineMonitoring: runDeadlineMonitoringMock,
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

describe("GET /api/cron/deadline-check", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    runDeadlineMonitoringMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/deadline-check", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runDeadlineMonitoringMock).not.toHaveBeenCalled();
  });

  it("returns the monitoring summary on success", async () => {
    runDeadlineMonitoringMock.mockResolvedValue({
      ok: true,
      deadlinesChecked: 9,
      remindersQueued: 3,
    });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/deadline-check", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      deadlinesChecked: 9,
      remindersQueued: 3,
    });
  });

  it("captures and reports failures", async () => {
    const error = new Error("scheduler offline");
    runDeadlineMonitoringMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/deadline-check", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to run deadline monitoring",
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.deadline-check", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Cron deadline-check failed",
      { message: "scheduler offline" },
    );
  });
});
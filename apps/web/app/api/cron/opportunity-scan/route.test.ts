import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runOpportunityScanMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runOpportunityScanMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/opportunity-scan.service", () => ({
  runOpportunityScan: runOpportunityScanMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerErrorMock },
  serializeErrorForLogs: serializeErrorForLogsMock,
}));

import { GET } from "./route";

describe("GET /api/cron/opportunity-scan", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    runOpportunityScanMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();
    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/cron/opportunity-scan", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(runOpportunityScanMock).not.toHaveBeenCalled();
  });

  it("delegates to runOpportunityScan and returns summary", async () => {
    runOpportunityScanMock.mockResolvedValue({
      success: true,
      processed: 4,
      newMatches: 2,
      errors: [],
      duration_ms: 1500,
    });

    const res = await GET(
      new NextRequest("http://localhost/api/cron/opportunity-scan", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      processed: 4,
      newMatches: 2,
      errors: [],
      duration_ms: 1500,
    });
    expect(runOpportunityScanMock).toHaveBeenCalledOnce();
  });

  it("returns 500 when service reports total failure", async () => {
    runOpportunityScanMock.mockResolvedValue({
      success: false,
      processed: 0,
      newMatches: 0,
      errors: ["No org found"],
      duration_ms: 0,
    });

    const res = await GET(
      new NextRequest("http://localhost/api/cron/opportunity-scan", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "Opportunity scan failed",
      details: "No org found",
    });
  });

  it("returns 500 when service throws", async () => {
    const error = new Error("DB connection failed");
    runOpportunityScanMock.mockRejectedValue(error);

    const res = await GET(
      new NextRequest("http://localhost/api/cron/opportunity-scan", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.opportunity-scan", method: "GET" },
    });
  });
});

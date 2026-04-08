import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runParishPackRefreshMock,
  runWithCronMonitorMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runParishPackRefreshMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/parish-pack-refresh.service", () => ({
  runParishPackRefresh: runParishPackRefreshMock,
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  fetchObjectBytesFromGateway: vi.fn(),
  systemAuth: vi.fn(),
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: loggerErrorMock,
  },
  serializeErrorForLogs: serializeErrorForLogsMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

import { GET } from "./route";

describe("GET /api/cron/parish-pack-refresh", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    runParishPackRefreshMock.mockReset();
    runWithCronMonitorMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    runWithCronMonitorMock.mockImplementation(({ handler }: { handler: () => Promise<Response> }) =>
      handler(),
    );
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runWithCronMonitorMock).not.toHaveBeenCalled();
  });

  it("delegates to runParishPackRefresh with query params and storage adapter", async () => {
    const mockSummary = {
      ok: true,
      message: "Parish pack refresh complete",
      timestamp: "2026-04-07T00:00:00.000Z",
      elapsedMs: 5000,
      stats: { total: 3, refreshed: 1, skipped: 2, errors: 0 },
    };
    runParishPackRefreshMock.mockResolvedValue(mockSummary);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh?jurisdictionId=j1&sku=SMALL_BAY_FLEX", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockSummary);
    expect(runParishPackRefreshMock).toHaveBeenCalledWith({
      jurisdictionId: "j1",
      sku: "SMALL_BAY_FLEX",
      storage: {
        fetchObjectBytes: expect.any(Function),
        systemAuth: expect.any(Function),
      },
    });
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "parish-pack-refresh",
        schedule: "0 4 * * 0",
      }),
    );
  });

  it("passes undefined for missing query params", async () => {
    runParishPackRefreshMock.mockResolvedValue({ ok: true, message: "done" });

    await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(runParishPackRefreshMock).toHaveBeenCalledWith({
      jurisdictionId: undefined,
      sku: undefined,
      storage: {
        fetchObjectBytes: expect.any(Function),
        systemAuth: expect.any(Function),
      },
    });
  });

  it("returns 500 when service throws", async () => {
    const error = new Error("DB connection failed");
    runParishPackRefreshMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/parish-pack-refresh", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: "Parish pack refresh failed",
      details: "Error: DB connection failed",
    });
  });
});

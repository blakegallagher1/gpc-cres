import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runSourceIngestionMock,
  runWithCronMonitorMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  runSourceIngestionMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@gpc/server/jobs/source-ingestion.service", () => ({
  runSourceIngestion: runSourceIngestionMock,
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

describe("GET /api/cron/source-ingestion", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    runSourceIngestionMock.mockReset();
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
      new NextRequest("http://localhost/api/cron/source-ingestion", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runWithCronMonitorMock).not.toHaveBeenCalled();
    expect(runSourceIngestionMock).not.toHaveBeenCalled();
  });

  it("wraps the handler in the cron monitor with the expected slug and schedule", async () => {
    runSourceIngestionMock.mockResolvedValue({
      ok: true,
      stats: {
        orgsProcessed: 0,
        staleSources: 0,
        discoveryCount: 0,
        staleRatios: [],
      },
    });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/source-ingestion", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "source-ingestion",
        schedule: "0 5 * * 0",
      }),
    );
  });

  it("returns the summary from runSourceIngestion on success", async () => {
    const summary = {
      ok: true,
      stats: {
        orgsProcessed: 1,
        staleSources: 2,
        discoveryCount: 1,
        staleRatios: [
          {
            orgId: "org-1",
            staleRatio: 0.5,
            staleOffenderCount: 1,
            staleOffenders: [
              {
                url: "https://official.example.gov/zoning",
                isOfficial: true,
              },
            ],
            sourceManifestHash: "manifest-hash",
          },
        ],
      },
    };
    runSourceIngestionMock.mockResolvedValue(summary);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/source-ingestion", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(runSourceIngestionMock).toHaveBeenCalledTimes(1);
  });

  it("captures and logs errors when runSourceIngestion throws", async () => {
    const error = new Error("source ingestion failed");
    runSourceIngestionMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/source-ingestion", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Source ingestion failed",
      details: "Error: source ingestion failed",
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.source-ingestion", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("Cron source-ingestion failed", {
      message: "source ingestion failed",
    });
  });
});

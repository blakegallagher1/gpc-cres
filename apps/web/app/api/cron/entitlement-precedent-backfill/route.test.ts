import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runEntitlementPrecedentBackfillCronMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  runEntitlementPrecedentBackfillCronMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@gpc/server", () => ({
  runEntitlementPrecedentBackfillCron: runEntitlementPrecedentBackfillCronMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

import { GET } from "./route";

describe("GET /api/cron/entitlement-precedent-backfill", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    runEntitlementPrecedentBackfillCronMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/entitlement-precedent-backfill", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(runEntitlementPrecedentBackfillCronMock).not.toHaveBeenCalled();
  });

  it("returns early when no orgs are available", async () => {
    runEntitlementPrecedentBackfillCronMock.mockResolvedValue({
      ok: true,
      message: "No orgs available for backfill.",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/cron/entitlement-precedent-backfill", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      message: "No orgs available for backfill.",
    });
    expect(runEntitlementPrecedentBackfillCronMock).toHaveBeenCalledWith({
      jurisdictionId: null,
      sourceLimit: 25,
      recordsPerSource: 75,
      evidenceLinksPerRecord: 2,
    });
  });

  it("records succeeded runs and captures nested monitor failures without failing the org result", async () => {
    runEntitlementPrecedentBackfillCronMock.mockResolvedValue({
      ok: true,
      orgsProcessed: 1,
      results: [
        {
          runId: "run-1",
          status: "succeeded",
          sourcesProcessed: 4,
          precedentsUpserted: 17,
          kpiMonitor: {
            success: false,
            error: "monitor drift failed",
          },
          strategyAutopilot: {
            success: true,
            recommendationsApplied: 2,
          },
        },
      ],
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/cron/entitlement-precedent-backfill?jurisdictionId=jur-1&sourceLimit=5&recordsPerSource=10&evidenceLinksPerRecord=3",
        {
          headers: { authorization: "Bearer cron-secret" },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.orgsProcessed).toBe(1);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({
      runId: "run-1",
      status: "succeeded",
      sourcesProcessed: 4,
      precedentsUpserted: 17,
      kpiMonitor: {
        success: false,
        error: "monitor drift failed",
      },
      strategyAutopilot: {
        success: true,
        recommendationsApplied: 2,
      },
    });
    expect(runEntitlementPrecedentBackfillCronMock).toHaveBeenCalledWith({
      jurisdictionId: "jur-1",
      sourceLimit: 5,
      recordsPerSource: 10,
      evidenceLinksPerRecord: 3,
    });
    expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
  });

  it("returns 500 when the delegated cron service errors", async () => {
    const error = new Error("connector ingest failed");
    runEntitlementPrecedentBackfillCronMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/entitlement-precedent-backfill", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "connector ingest failed" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.entitlement-precedent-backfill", method: "GET" },
    });
  });
});

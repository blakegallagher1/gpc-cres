import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orgFindManyMock,
  runCreateMock,
  runUpdateMock,
  backfillEntitlementOutcomePrecedentsMock,
  runEntitlementKpiDriftMonitorMock,
  runEntitlementStrategyAutopilotSweepMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  orgFindManyMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  backfillEntitlementOutcomePrecedentsMock: vi.fn(),
  runEntitlementKpiDriftMonitorMock: vi.fn(),
  runEntitlementStrategyAutopilotSweepMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    org: {
      findMany: orgFindManyMock,
    },
    run: {
      create: runCreateMock,
      update: runUpdateMock,
    },
  },
}));

vi.mock("@/lib/services/entitlementPrecedentBackfill.service", () => ({
  backfillEntitlementOutcomePrecedents: backfillEntitlementOutcomePrecedentsMock,
}));

vi.mock("@/lib/services/entitlementKpiMonitor.service", () => ({
  runEntitlementKpiDriftMonitor: runEntitlementKpiDriftMonitorMock,
}));

vi.mock("@/lib/services/entitlementStrategyAutopilot.service", () => ({
  runEntitlementStrategyAutopilotSweep: runEntitlementStrategyAutopilotSweepMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

import { GET } from "./route";

describe("GET /api/cron/entitlement-precedent-backfill", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    orgFindManyMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    backfillEntitlementOutcomePrecedentsMock.mockReset();
    runEntitlementKpiDriftMonitorMock.mockReset();
    runEntitlementStrategyAutopilotSweepMock.mockReset();
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
    expect(orgFindManyMock).not.toHaveBeenCalled();
  });

  it("returns early when no orgs are available", async () => {
    orgFindManyMock.mockResolvedValue([]);

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
    expect(runCreateMock).not.toHaveBeenCalled();
  });

  it("records succeeded runs and captures nested monitor failures without failing the org result", async () => {
    const monitorError = new Error("monitor drift failed");
    orgFindManyMock.mockResolvedValue([{ id: "org-1" }]);
    runCreateMock.mockResolvedValue({ id: "run-1" });
    backfillEntitlementOutcomePrecedentsMock.mockResolvedValue({
      sourcesProcessed: 4,
      precedentsUpserted: 17,
    });
    runEntitlementKpiDriftMonitorMock.mockRejectedValue(monitorError);
    runEntitlementStrategyAutopilotSweepMock.mockResolvedValue({
      success: true,
      recommendationsApplied: 2,
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
    expect(backfillEntitlementOutcomePrecedentsMock).toHaveBeenCalledWith({
      orgId: "org-1",
      runId: "run-1",
      jurisdictionId: "jur-1",
      sourceLimit: 5,
      recordsPerSource: 10,
      evidenceLinksPerRecord: 3,
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(monitorError, {
      tags: { route: "api.cron.entitlement-precedent-backfill", method: "GET" },
    });
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "succeeded",
        finishedAt: expect.any(Date),
        outputJson: expect.objectContaining({
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
        }),
      },
    });
  });

  it("marks the run failed when the backfill itself errors", async () => {
    const error = new Error("connector ingest failed");
    orgFindManyMock.mockResolvedValue([{ id: "org-1" }]);
    runCreateMock.mockResolvedValue({ id: "run-1" });
    backfillEntitlementOutcomePrecedentsMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/entitlement-precedent-backfill", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toEqual([
      {
        orgId: "org-1",
        runId: "run-1",
        status: "failed",
        error: "connector ingest failed",
      },
    ]);
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.entitlement-precedent-backfill", method: "GET" },
    });
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "failed",
        finishedAt: expect.any(Date),
        error: "connector ingest failed",
      },
    });
  });
});
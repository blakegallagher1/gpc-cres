import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findSourcesMock,
  runCreateMock,
  runUpdateMock,
  evidenceSnapshotCountMock,
  dealFindManyMock,
  taskCreateMock,
  captureEvidenceMock,
  withRetryMock,
  withTimeoutMock,
  computeScanStatsMock,
  groupChangesByJurisdictionMock,
  runWithCronMonitorMock,
  sentryCaptureExceptionMock,
  loggerInfoMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  findSourcesMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  evidenceSnapshotCountMock: vi.fn(),
  dealFindManyMock: vi.fn(),
  taskCreateMock: vi.fn(),
  captureEvidenceMock: vi.fn(),
  withRetryMock: vi.fn(),
  withTimeoutMock: vi.fn(),
  computeScanStatsMock: vi.fn(),
  groupChangesByJurisdictionMock: vi.fn(),
  runWithCronMonitorMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    jurisdictionSeedSource: {
      findMany: findSourcesMock,
    },
    run: {
      create: runCreateMock,
      update: runUpdateMock,
    },
    evidenceSnapshot: {
      count: evidenceSnapshotCountMock,
    },
    deal: {
      findMany: dealFindManyMock,
    },
    task: {
      create: taskCreateMock,
    },
  },
}));

vi.mock("@entitlement-os/evidence", () => ({
  captureEvidence: captureEvidenceMock,
  isMaterialChange: vi.fn(),
  computeScanStats: computeScanStatsMock,
  groupChangesByJurisdiction: groupChangesByJurisdictionMock,
  withRetry: withRetryMock,
  withTimeout: withTimeoutMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  runWithCronMonitor: runWithCronMonitorMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
  serializeErrorForLogs: serializeErrorForLogsMock,
}));

import { GET } from "./route";

describe("GET /api/cron/change-detection", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";

    findSourcesMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    evidenceSnapshotCountMock.mockReset();
    dealFindManyMock.mockReset();
    taskCreateMock.mockReset();
    captureEvidenceMock.mockReset();
    withRetryMock.mockReset();
    withTimeoutMock.mockReset();
    computeScanStatsMock.mockReset();
    groupChangesByJurisdictionMock.mockReset();
    runWithCronMonitorMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerInfoMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    runWithCronMonitorMock.mockImplementation(({ handler }: { handler: () => Promise<Response> }) =>
      handler(),
    );
    withRetryMock.mockImplementation(
      async (operation: () => Promise<unknown>) => operation(),
    );
    withTimeoutMock.mockImplementation(
      async (operation: Promise<unknown>) => operation,
    );
    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
    dealFindManyMock.mockResolvedValue([]);
    taskCreateMock.mockResolvedValue({});
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
  });

  it("returns an empty summary when there are no active sources", async () => {
    findSourcesMock.mockResolvedValue([]);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      message: "No active seed sources to monitor",
      stats: { total: 0, changed: 0, unreachable: 0 },
    });
    expect(runCreateMock).not.toHaveBeenCalled();
    expect(runWithCronMonitorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "change-detection",
        schedule: "0 6 * * *",
      }),
    );
  });

  it("captures changes, creates review tasks, and records the run summary", async () => {
    findSourcesMock.mockResolvedValue([
      {
        url: "https://city.example/ordinance",
        jurisdictionId: "jur-1",
        purpose: "zoning",
        jurisdiction: {
          id: "jur-1",
          name: "Baton Rouge",
          orgId: "org-1",
          officialDomains: ["city.example"],
        },
      },
    ]);
    runCreateMock.mockResolvedValue({ id: "run-1" });
    captureEvidenceMock.mockResolvedValue({
      sourceId: "source-1",
      changed: true,
    });
    evidenceSnapshotCountMock.mockResolvedValue(2);
    computeScanStatsMock.mockImplementation((results: Array<Record<string, unknown>>) => ({
      total: results.length,
      unreachable: 0,
      unreachableRatio: 0,
      networkAlert: false,
      materialChangeCount: 1,
      firstCaptureCount: 0,
      materialChanges: [
        {
          url: "https://city.example/ordinance",
          jurisdictionId: "jur-1",
          jurisdictionName: "Baton Rouge",
          purpose: "zoning",
        },
      ],
    }));
    groupChangesByJurisdictionMock.mockReturnValue(
      new Map([
        [
          "jur-1",
          [
            {
              url: "https://city.example/ordinance",
              jurisdictionId: "jur-1",
              jurisdictionName: "Baton Rouge",
              purpose: "zoning",
            },
          ],
        ],
      ]),
    );
    dealFindManyMock.mockResolvedValue([
      {
        id: "deal-1",
        name: "Acadia Industrial",
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/change-detection", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
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
    });
    expect(runCreateMock).toHaveBeenCalledWith({
      data: {
        orgId: "org-1",
        runType: "CHANGE_DETECT",
        status: "running",
      },
    });
    expect(taskCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        dealId: "deal-1",
        title: "Review policy changes: Baton Rouge",
        status: "TODO",
        pipelineStep: 4,
      }),
    });
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: expect.objectContaining({
        status: "succeeded",
        finishedAt: expect.any(Date),
        outputJson: expect.objectContaining({
          totalSources: 1,
          materialChangeCount: 1,
          tasksCreated: 1,
        }),
      }),
    });
  });
});
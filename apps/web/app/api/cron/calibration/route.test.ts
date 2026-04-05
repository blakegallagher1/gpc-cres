import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orgFindManyMock,
  recomputeAllSegmentsMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  orgFindManyMock: vi.fn(),
  recomputeAllSegmentsMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  serializeErrorForLogsMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    org: {
      findMany: orgFindManyMock,
    },
  },
}));

vi.mock("@/lib/jobs/calibrationRecompute", () => ({
  recomputeAllSegments: recomputeAllSegmentsMock,
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

describe("GET /api/cron/calibration", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    orgFindManyMock.mockReset();
    recomputeAllSegmentsMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();

    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(orgFindManyMock).not.toHaveBeenCalled();
  });

  it("recomputes all org segments and returns success when no errors occur", async () => {
    orgFindManyMock.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    recomputeAllSegmentsMock.mockResolvedValue(undefined);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      orgsProcessed: 2,
      errors: [],
    });
    expect(recomputeAllSegmentsMock).toHaveBeenNthCalledWith(1, "org-1");
    expect(recomputeAllSegmentsMock).toHaveBeenNthCalledWith(2, "org-2");
  });

  it("captures per-org recompute failures while continuing the run", async () => {
    const orgError = new Error("segment drift overflow");
    orgFindManyMock.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    recomputeAllSegmentsMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(orgError);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: false,
      orgsProcessed: 2,
      errors: [
        { orgId: "org-2", error: "segment drift overflow" },
      ],
    });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(orgError, {
      tags: { route: "api.cron.calibration", method: "GET" },
    });
  });

  it("captures top-level failures and returns 500", async () => {
    const error = new Error("org query failed");
    orgFindManyMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/calibration", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.calibration", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith("Cron calibration failed", {
      message: "org query failed",
    });
  });
});
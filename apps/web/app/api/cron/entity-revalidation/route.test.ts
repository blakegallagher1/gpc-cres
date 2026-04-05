import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orgFindManyMock,
  detectCollisionsMock,
  persistCollisionAlertsMock,
  sentryCaptureExceptionMock,
  loggerErrorMock,
  serializeErrorForLogsMock,
} = vi.hoisted(() => ({
  orgFindManyMock: vi.fn(),
  detectCollisionsMock: vi.fn(),
  persistCollisionAlertsMock: vi.fn(),
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

vi.mock("@/lib/services/entityCollisionDetector", () => ({
  detectCollisions: detectCollisionsMock,
  persistCollisionAlerts: persistCollisionAlertsMock,
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

describe("GET /api/cron/entity-revalidation", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    orgFindManyMock.mockReset();
    detectCollisionsMock.mockReset();
    persistCollisionAlertsMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    loggerErrorMock.mockReset();
    serializeErrorForLogsMock.mockReset();
    serializeErrorForLogsMock.mockImplementation((error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
    }));
  });

  it("returns 401 when cron secret is invalid", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/cron/entity-revalidation", {
        headers: { authorization: "Bearer wrong-secret" },
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(orgFindManyMock).not.toHaveBeenCalled();
  });

  it("scans orgs and persists collision alerts", async () => {
    orgFindManyMock.mockResolvedValue([{ id: "org-1" }, { id: "org-2" }]);
    detectCollisionsMock
      .mockResolvedValueOnce([{ entityId: "entity-1" }])
      .mockResolvedValueOnce([]);
    persistCollisionAlertsMock
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/entity-revalidation", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      orgsProcessed: 2,
      summary: [
        { orgId: "org-1", collisionsFound: 1, alertsCreated: 1 },
        { orgId: "org-2", collisionsFound: 0, alertsCreated: 0 },
      ],
    });
    expect(detectCollisionsMock).toHaveBeenNthCalledWith(1, "org-1");
    expect(detectCollisionsMock).toHaveBeenNthCalledWith(2, "org-2");
    expect(persistCollisionAlertsMock).toHaveBeenNthCalledWith(1, "org-1", [
      { entityId: "entity-1" },
    ]);
  });

  it("captures failures and returns 500", async () => {
    const error = new Error("detector exploded");
    orgFindManyMock.mockRejectedValue(error);

    const response = await GET(
      new NextRequest("http://localhost/api/cron/entity-revalidation", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
    expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(error, {
      tags: { route: "api.cron.entity-revalidation", method: "GET" },
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "Cron entity-revalidation failed",
      { message: "detector exploded" },
    );
  });
});
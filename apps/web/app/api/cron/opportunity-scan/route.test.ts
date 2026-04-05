import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  orgFindFirstMock,
  runCreateMock,
  runUpdateMock,
  executeMock,
  OpportunityScannerJobMock,
} = vi.hoisted(() => ({
  orgFindFirstMock: vi.fn(),
  runCreateMock: vi.fn(),
  runUpdateMock: vi.fn(),
  executeMock: vi.fn(),
  OpportunityScannerJobMock: vi.fn(function OpportunityScannerJob() {
    return { execute: executeMock };
  }),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    org: { findFirst: orgFindFirstMock },
    run: { create: runCreateMock, update: runUpdateMock },
  },
}));

vi.mock("@/lib/jobs/opportunity-scanner.job", () => ({
  OpportunityScannerJob: OpportunityScannerJobMock,
}));

import { GET } from "./route";

describe("GET /api/cron/opportunity-scan", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    orgFindFirstMock.mockReset();
    runCreateMock.mockReset();
    runUpdateMock.mockReset();
    executeMock.mockReset();
    OpportunityScannerJobMock.mockClear();
    orgFindFirstMock.mockResolvedValue({ id: "org-1" });
    runCreateMock.mockResolvedValue({ id: "run-1" });
    runUpdateMock.mockResolvedValue({});
    executeMock.mockResolvedValue({
      success: true,
      processed: 4,
      newMatches: 2,
      errors: [],
      duration_ms: 1500,
    });
  });

  it("returns 401 when cron secret is invalid", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/opportunity-scan", {
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when no org exists for the audit run", async () => {
    orgFindFirstMock.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/cron/opportunity-scan", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No org found" });
  });

  it("creates an audit run, executes the job, and records the result", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/opportunity-scan", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      processed: 4,
      newMatches: 2,
      errors: [],
      duration_ms: 1500,
    });
    expect(runCreateMock).toHaveBeenCalledWith({
      data: {
        orgId: "org-1",
        runType: "OPPORTUNITY_SCAN",
        status: "running",
      },
    });
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: {
        status: "succeeded",
        finishedAt: expect.any(Date),
        error: null,
        outputJson: {
          processed: 4,
          newMatches: 2,
          duration_ms: 1500,
        },
      },
    });
  });
});
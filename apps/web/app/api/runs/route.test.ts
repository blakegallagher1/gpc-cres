import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, runFindManyMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runFindManyMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    run: {
      findMany: runFindManyMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";
import { GET } from "./route";

describe("GET /api/runs", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    runFindManyMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/runs");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(runFindManyMock).not.toHaveBeenCalled();
  });

  it("applies filters, clamps limit, and maps summary fields", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    runFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        orgId: "11111111-1111-4111-8111-111111111111",
        runType: "TRIAGE",
        status: "succeeded",
        startedAt: new Date("2026-04-04T10:00:00.000Z"),
        finishedAt: new Date("2026-04-04T10:00:08.000Z"),
        dealId: "deal-1",
        jurisdictionId: "jurisdiction-1",
        sku: "IOS",
        error: null,
        inputHash: "hash-1",
        openaiResponseId: "resp-1",
        outputJson: {
          runState: {
            [AGENT_RUN_STATE_KEYS.lastAgentName]: "coordinator",
            [AGENT_RUN_STATE_KEYS.confidence]: 0.91,
            [AGENT_RUN_STATE_KEYS.missingEvidence]: ["title"],
            [AGENT_RUN_STATE_KEYS.toolsInvoked]: ["get_deal_context", "screen_batch"],
          },
          evidenceCitations: [{ sourceId: "source-1" }, { sourceId: "source-2" }],
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/runs?status=succeeded&runType=TRIAGE&dealId=deal-1&jurisdictionId=jurisdiction-1&limit=500",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(runFindManyMock).toHaveBeenCalledWith({
      where: {
        orgId: "11111111-1111-4111-8111-111111111111",
        status: "succeeded",
        runType: "TRIAGE",
        dealId: "deal-1",
        jurisdictionId: "jurisdiction-1",
      },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: {
        id: true,
        orgId: true,
        runType: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        dealId: true,
        jurisdictionId: true,
        sku: true,
        error: true,
        inputHash: true,
        openaiResponseId: true,
        outputJson: true,
      },
    });
    expect(body).toEqual({
      runs: [
        {
          id: "run-1",
          orgId: "11111111-1111-4111-8111-111111111111",
          runType: "TRIAGE",
          status: "succeeded",
          startedAt: "2026-04-04T10:00:00.000Z",
          finishedAt: "2026-04-04T10:00:08.000Z",
          durationMs: 8000,
          dealId: "deal-1",
          jurisdictionId: "jurisdiction-1",
          sku: "IOS",
          error: null,
          inputHash: "hash-1",
          openaiResponseId: "resp-1",
          summary: {
            lastAgentName: "coordinator",
            confidence: 0.91,
            evidenceCount: 2,
            missingEvidenceCount: 1,
            toolCount: 2,
          },
        },
      ],
    });
  });

  it("returns 500 when run lookup fails", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    const error = new Error("prisma unavailable");
    runFindManyMock.mockRejectedValue(error);

    const req = new NextRequest("http://localhost/api/runs");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Failed to fetch runs" });
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { route: "api.runs", method: "GET" },
      }),
    );
  });
});
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, listRunsMock, captureExceptionMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listRunsMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listRuns: listRunsMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { GET } from "./route";

describe("GET /api/runs", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listRunsMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/runs");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listRunsMock).not.toHaveBeenCalled();
  });

  it("passes filters through the package seam", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    listRunsMock.mockResolvedValue([
      {
        id: "run-1",
        orgId: "11111111-1111-4111-8111-111111111111",
        runType: "TRIAGE",
        status: "succeeded",
        startedAt: "2026-04-04T10:00:00.000Z",
        finishedAt: "2026-04-04T10:00:08.000Z",
        dealId: "deal-1",
        jurisdictionId: "jurisdiction-1",
        sku: "IOS",
        error: null,
        inputHash: "hash-1",
        openaiResponseId: "resp-1",
        durationMs: 8000,
        summary: {
          lastAgentName: "coordinator",
          confidence: 0.91,
          evidenceCount: 2,
          missingEvidenceCount: 1,
          toolCount: 2,
        },
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/runs?status=succeeded&runType=TRIAGE&dealId=deal-1&jurisdictionId=jurisdiction-1&limit=500",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(listRunsMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        status: "succeeded",
        runType: "TRIAGE",
        dealId: "deal-1",
        jurisdictionId: "jurisdiction-1",
        limit: 500,
      },
    );
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
    listRunsMock.mockRejectedValue(error);

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

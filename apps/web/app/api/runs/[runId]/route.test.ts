import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getRunDetailMock,
  deleteRunMock,
  runRouteNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getRunDetailMock: vi.fn(),
  deleteRunMock: vi.fn(),
  runRouteNotFoundErrorMock: class RunRouteNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getRunDetail: getRunDetailMock,
  deleteRun: deleteRunMock,
  RunRouteNotFoundError: runRouteNotFoundErrorMock,
}));

import { DELETE, GET } from "./route";

describe("/api/runs/[runId]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getRunDetailMock.mockReset();
    deleteRunMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/runs/run-1"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getRunDetailMock).not.toHaveBeenCalled();
  });

  it("returns run details from the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getRunDetailMock.mockResolvedValue({
      id: "run-1",
      orgId: "org-1",
      runType: "TRIAGE",
      status: "succeeded",
      startedAt: "2026-04-08T00:00:00.000Z",
      finishedAt: "2026-04-08T00:00:02.000Z",
      durationMs: 2000,
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      sku: "sku-1",
      error: null,
      inputHash: "hash-1",
      openaiResponseId: "resp-1",
      outputJson: { ok: true },
    });

    const response = await GET(new NextRequest("http://localhost/api/runs/run-1"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(200);
    expect(getRunDetailMock).toHaveBeenCalledWith("org-1", "run-1");
    await expect(response.json()).resolves.toEqual({
      run: {
        id: "run-1",
        orgId: "org-1",
        runType: "TRIAGE",
        status: "succeeded",
        startedAt: "2026-04-08T00:00:00.000Z",
        finishedAt: "2026-04-08T00:00:02.000Z",
        durationMs: 2000,
        dealId: "deal-1",
        jurisdictionId: "jurisdiction-1",
        sku: "sku-1",
        error: null,
        inputHash: "hash-1",
        openaiResponseId: "resp-1",
        outputJson: { ok: true },
      },
    });
  });

  it("maps not-found deletes to 404", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    deleteRunMock.mockRejectedValue(new runRouteNotFoundErrorMock("Run not found"));

    const response = await DELETE(new NextRequest("http://localhost/api/runs/run-1"), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});

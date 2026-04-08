import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getRunTracesMock,
  runRouteNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getRunTracesMock: vi.fn(),
  runRouteNotFoundErrorMock: class RunRouteNotFoundError extends Error {},
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getRunTraces: getRunTracesMock,
  RunRouteNotFoundError: runRouteNotFoundErrorMock,
}));

import { GET } from "./route";

describe("/api/runs/[runId]/traces", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getRunTracesMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/traces"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns traces from the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getRunTracesMock.mockResolvedValue([
      {
        id: "trace-1",
        runId: "run-1",
        parentId: null,
        type: "tool",
        name: "search",
        input: { q: "parcel" },
        output: { ok: true },
        startedAt: "2026-04-08T00:00:00.000Z",
        durationMs: 150,
        tokensInput: 10,
        tokensOutput: 15,
        cost: 0.02,
        metadata: { source: "tool" },
      },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/traces"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(getRunTracesMock).toHaveBeenCalledWith("org-1", "run-1");
    await expect(response.json()).resolves.toEqual({
      traces: [
        {
          id: "trace-1",
          runId: "run-1",
          parentId: null,
          type: "tool",
          name: "search",
          input: { q: "parcel" },
          output: { ok: true },
          startedAt: "2026-04-08T00:00:00.000Z",
          durationMs: 150,
          tokensInput: 10,
          tokensOutput: 15,
          cost: 0.02,
          metadata: { source: "tool" },
        },
      ],
    });
  });

  it("maps package not-found errors to 404", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getRunTracesMock.mockRejectedValue(
      new runRouteNotFoundErrorMock("Run not found"),
    );

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/traces"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("fails open to an empty traces list when trace lookup degrades", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getRunTracesMock.mockRejectedValue(new Error("traces table unavailable"));

    const response = await GET(
      new NextRequest("http://localhost/api/runs/run-1/traces"),
      {
        params: Promise.resolve({ runId: "run-1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ traces: [] });
  });
});

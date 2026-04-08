import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, getToolHealthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getToolHealthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getToolHealth: getToolHealthMock,
}));

import { GET } from "./route";

describe("/api/tools/health", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getToolHealthMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const response = await GET(new NextRequest("http://localhost/api/tools/health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getToolHealthMock).not.toHaveBeenCalled();
  });

  it("returns tool-health data from the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    getToolHealthMock.mockResolvedValue([
      {
        toolName: "parcel_lookup",
        totalCalls: 12,
        successRate: 99,
        avgLatency: 143,
        fallbackRate: 0,
        lastFailure: null,
        status: "HEALTHY",
      },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/tools/health"));

    expect(response.status).toBe(200);
    expect(getToolHealthMock).toHaveBeenCalledWith("org-1");
    await expect(response.json()).resolves.toEqual({
      tools: [
        {
          toolName: "parcel_lookup",
          totalCalls: 12,
          successRate: 99,
          avgLatency: 143,
          fallbackRate: 0,
          lastFailure: null,
          status: "HEALTHY",
        },
      ],
    });
  });
});

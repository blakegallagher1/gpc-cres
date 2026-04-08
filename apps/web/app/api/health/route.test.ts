import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTokenMock,
  userHasHealthAccessMock,
  getHealthStatusSnapshotMock,
} = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  userHasHealthAccessMock: vi.fn(),
  getHealthStatusSnapshotMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@gpc/server", () => ({
  getHealthStatusSnapshot: getHealthStatusSnapshotMock,
  userHasHealthAccess: userHasHealthAccessMock,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = {
      ...envSnapshot,
      AUTH_SECRET: "test-secret",
      HEALTHCHECK_TOKEN: "health-token",
      LOCAL_API_URL: "http://gateway.test",
      LOCAL_API_KEY: "gateway-key",
      OPENAI_API_KEY: "test-openai",
    };
    getHealthStatusSnapshotMock.mockResolvedValue({
      status: "ok",
      missing: [],
      propertyDb: {
        configured: true,
        reachable: true,
        dbMode: "gateway",
        gatewayConfigured: true,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      build: {
        sha: null,
        ref: null,
        provider: null,
      },
      timestamp: "2026-04-08T08:00:00.000Z",
    });
  });

  it("returns 401 when request is not authorized", async () => {
    getTokenMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/health");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getHealthStatusSnapshotMock).not.toHaveBeenCalled();
  });

  it("accepts the static health token and returns the delegated payload", async () => {
    const req = new NextRequest("http://localhost/api/health", {
      headers: { Authorization: "Bearer health-token" },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: "ok",
      missing: [],
      propertyDb: {
        configured: true,
        reachable: true,
        dbMode: "gateway",
        gatewayConfigured: true,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      build: {
        sha: null,
        ref: null,
        provider: null,
      },
      timestamp: "2026-04-08T08:00:00.000Z",
    });
    expect(getHealthStatusSnapshotMock).toHaveBeenCalledWith({
      authSecretConfigured: true,
      localApiUrlConfigured: true,
      localApiKeyConfigured: true,
    });
  });

  it("falls back to authenticated membership access", async () => {
    getTokenMock.mockResolvedValue({ userId: "user-1" });
    userHasHealthAccessMock.mockResolvedValue(true);
    getHealthStatusSnapshotMock.mockResolvedValue({
      status: "degraded",
      missing: ["LOCAL_API_URL"],
      propertyDb: {
        configured: false,
        reachable: null,
        dbMode: "unconfigured",
        gatewayConfigured: false,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      build: {
        sha: null,
        ref: null,
        provider: null,
      },
      timestamp: "2026-04-08T08:00:00.000Z",
    });

    const req = new NextRequest("http://localhost/api/health");
    const res = await GET(req);

    expect(res.status).toBe(500);
    expect(userHasHealthAccessMock).toHaveBeenCalledWith("user-1");
    expect(await res.json()).toEqual({
      status: "degraded",
      missing: ["LOCAL_API_URL"],
      propertyDb: {
        configured: false,
        reachable: null,
        dbMode: "unconfigured",
        gatewayConfigured: false,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      build: {
        sha: null,
        ref: null,
        provider: null,
      },
      timestamp: "2026-04-08T08:00:00.000Z",
    });
  });
});

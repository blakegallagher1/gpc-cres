import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAuthMock,
  userHasHealthAccessMock,
  getHealthStatusSnapshotMock,
} = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  userHasHealthAccessMock: vi.fn(),
  getHealthStatusSnapshotMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  getAuth: getAuthMock,
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
      CLERK_SECRET_KEY: "sk_test_secret",
      HEALTHCHECK_TOKEN: "health-token",
      LOCAL_API_URL: "http://gateway.test",
      LOCAL_API_KEY: "gateway-key",
      OPENAI_API_KEY: "test-openai",
    };
    // Default: no authenticated user
    getAuthMock.mockReturnValue({ userId: null });
    getHealthStatusSnapshotMock.mockResolvedValue({
      status: "ok",
      missing: [],
      appDb: {
        ok: true,
        latencyMs: 12,
      },
      propertyDb: {
        configured: true,
        reachable: true,
        dbMode: "gateway",
        gatewayConfigured: true,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      controlPlane: {
        propertyGateway: { configured: true, reachable: true, latencyMs: 25 },
        adminApi: { configured: true, reachable: true, latencyMs: 26 },
        cuaWorker: { configured: true, reachable: true, latencyMs: 27 },
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
    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;
    getAuthMock.mockReturnValue({ userId: null });

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
      appDb: {
        ok: true,
        latencyMs: 12,
      },
      propertyDb: {
        configured: true,
        reachable: true,
        dbMode: "gateway",
        gatewayConfigured: true,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      controlPlane: {
        propertyGateway: { configured: true, reachable: true, latencyMs: 25 },
        adminApi: { configured: true, reachable: true, latencyMs: 26 },
        cuaWorker: { configured: true, reachable: true, latencyMs: 27 },
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
    delete process.env.HEALTHCHECK_TOKEN;
    delete process.env.VERCEL_ACCESS_TOKEN;
    getAuthMock.mockReturnValue({ userId: "clerk_user_1" });
    userHasHealthAccessMock.mockResolvedValue(true);
    getHealthStatusSnapshotMock.mockResolvedValue({
      status: "degraded",
      missing: ["LOCAL_API_URL"],
      appDb: {
        ok: true,
        latencyMs: 18,
      },
      propertyDb: {
        configured: false,
        reachable: null,
        dbMode: "unconfigured",
        gatewayConfigured: false,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      controlPlane: {
        propertyGateway: { configured: false, reachable: null },
        adminApi: { configured: false, reachable: null },
        cuaWorker: { configured: false, reachable: null },
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
    expect(userHasHealthAccessMock).toHaveBeenCalledWith("clerk_user_1");
    expect(await res.json()).toEqual({
      status: "degraded",
      missing: ["LOCAL_API_URL"],
      appDb: {
        ok: true,
        latencyMs: 18,
      },
      propertyDb: {
        configured: false,
        reachable: null,
        dbMode: "unconfigured",
        gatewayConfigured: false,
        directUrlConfigured: false,
        monitorAuthConfigured: true,
      },
      controlPlane: {
        propertyGateway: { configured: false, reachable: null },
        adminApi: { configured: false, reachable: null },
        cuaWorker: { configured: false, reachable: null },
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

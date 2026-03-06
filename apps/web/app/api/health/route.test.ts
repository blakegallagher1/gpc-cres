import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTokenMock,
  membershipFindFirstMock,
  getPropertyDbConfigOrNullMock,
  getCloudflareAccessHeadersFromEnvMock,
} = vi.hoisted(() => ({
  getTokenMock: vi.fn(),
  membershipFindFirstMock: vi.fn(),
  getPropertyDbConfigOrNullMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
}));

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    orgMembership: {
      findFirst: membershipFindFirstMock,
    },
  },
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getPropertyDbConfigOrNull: getPropertyDbConfigOrNullMock,
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  const fetchMock = vi.fn();
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    process.env = {
      ...envSnapshot,
      AUTH_SECRET: "test-secret",
      HEALTHCHECK_TOKEN: "health-token",
      LOCAL_API_URL: "http://gateway.test",
      LOCAL_API_KEY: "gateway-key",
      OPENAI_API_KEY: "test-openai",
    };
    delete process.env.DATABASE_URL;
    delete process.env.VERCEL_ACCESS_TOKEN;
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "http://gateway.test",
      key: "gateway-key",
    });
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({});
  });

  it("returns 401 when request is not authorized", async () => {
    getTokenMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/health");
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("checks /health first and returns 200 on success", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => "ok",
    } as Response);

    const req = new NextRequest("http://localhost/api/health", {
      headers: { Authorization: "Bearer health-token" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.missing).toEqual([]);
    expect(body.propertyDb).toMatchObject({
      dbMode: "gateway",
      gatewayConfigured: true,
      directUrlConfigured: false,
      monitorAuthConfigured: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://gateway.test/health");
  });

  it("falls back to /admin/health when /health is unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        text: async () => "not found",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => "ok",
      } as Response);

    const req = new NextRequest("http://localhost/api/health", {
      headers: { Authorization: "Bearer health-token" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.propertyDb.reachable).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://gateway.test/health");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://gateway.test/admin/health");
  });

  it("reports down when the gateway-local Postgres path is not configured", async () => {
    delete process.env.LOCAL_API_URL;
    getPropertyDbConfigOrNullMock.mockReturnValue(null);

    const req = new NextRequest("http://localhost/api/health", {
      headers: { Authorization: "Bearer health-token" },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe("down");
    expect(body.missing).toContain("LOCAL_API_URL");
    expect(body.propertyDb).toMatchObject({
      configured: false,
      reachable: null,
      dbMode: "unconfigured",
      gatewayConfigured: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

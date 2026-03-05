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
      OPENAI_FLAGSHIP_MODEL: "gpt-5.2",
      OPENAI_STANDARD_MODEL: "gpt-5.1",
      OPENAI_MINI_MODEL: "gpt-5-mini",
      PERPLEXITY_API_KEY: "test-perplexity",
      PERPLEXITY_MODEL: "sonar",
      DATABASE_URL: "postgres://test",
      GOOGLE_MAPS_API_KEY: "test",
      GOOGLE_PLACES_API_KEY: "test",
      GOOGLE_SHEETS_API_KEY: "test",
      GOOGLE_DRIVE_API_KEY: "test",
      B2_S3_ENDPOINT_URL: "https://s3.us-west-001.backblazeb2.com",
      B2_ACCESS_KEY_ID: "test",
      B2_SECRET_ACCESS_KEY: "test",
      B2_BUCKET: "test",
      APP_ENV: "test",
      APP_DEBUG: "false",
      APP_LOG_LEVEL: "info",
      AGENT_MAX_TURNS: "12",
      AGENT_TIMEOUT_SECONDS: "120",
      AGENT_ENABLE_TRACING: "false",
      DEFAULT_MARKET_REGION: "BR",
      DEFAULT_STATE: "LA",
      DEFAULT_MSA: "Baton Rouge",
      ENABLE_WEB_SEARCH: "true",
      ENABLE_FILE_SEARCH: "true",
      ENABLE_CODE_INTERPRETER: "false",
      VERCEL_ACCESS_TOKEN: "token",
      VERCEL_USER_ID: "user",
      VERCEL_TEAM_ID: "team",
      VERCEL_TEAM_URL: "team-url",
    };
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
});

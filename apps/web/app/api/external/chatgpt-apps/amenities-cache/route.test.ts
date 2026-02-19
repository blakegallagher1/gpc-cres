import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getAmenitiesCacheMock,
  upsertAmenitiesCacheMock,
  checkRateLimitMock,
  captureChatGptAppsErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getAmenitiesCacheMock: vi.fn(),
  upsertAmenitiesCacheMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  captureChatGptAppsErrorMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureChatGptAppsError: captureChatGptAppsErrorMock,
}));

vi.mock("@/lib/server/chatgptAppsClient", () => ({
  toOrgScopedCacheKey: (orgId: string, cacheKey: string) => `${orgId}:${cacheKey}`,
  getAmenitiesCache: getAmenitiesCacheMock,
  upsertAmenitiesCache: upsertAmenitiesCacheMock,
}));

describe("/api/external/chatgpt-apps/amenities-cache org namespacing", () => {
  let GET: typeof import("./route").GET;
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    getAmenitiesCacheMock.mockReset();
    upsertAmenitiesCacheMock.mockReset();
    checkRateLimitMock.mockReset();
    captureChatGptAppsErrorMock.mockReset();
    checkRateLimitMock.mockReturnValue(true);
    ({ GET, POST } = await import("./route"));
  });

  it("GET uses org-prefixed cache key on happy path", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-a", orgId: "org-a" });
    getAmenitiesCacheMock.mockResolvedValue({
      ok: true,
      data: { hit: true, payload: { parks: 3 } },
      requestId: "rid-1",
      durationMs: 5,
    });

    const req = new NextRequest(
      "http://localhost/api/external/chatgpt-apps/amenities-cache?cacheKey=schools:70810",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(getAmenitiesCacheMock).toHaveBeenCalledWith("org-a:schools:70810", expect.any(String));
  });

  it("isolates cross-tenant cache keys for the same raw key", async () => {
    getAmenitiesCacheMock.mockResolvedValue({
      ok: true,
      data: { hit: false, payload: null },
      requestId: "rid-2",
      durationMs: 4,
    });

    resolveAuthMock.mockResolvedValueOnce({ userId: "user-a", orgId: "org-a" });
    await GET(
      new NextRequest(
        "http://localhost/api/external/chatgpt-apps/amenities-cache?cacheKey=schools:70810",
      ),
    );

    resolveAuthMock.mockResolvedValueOnce({ userId: "user-b", orgId: "org-b" });
    await GET(
      new NextRequest(
        "http://localhost/api/external/chatgpt-apps/amenities-cache?cacheKey=schools:70810",
      ),
    );

    expect(getAmenitiesCacheMock).toHaveBeenNthCalledWith(
      1,
      "org-a:schools:70810",
      expect.any(String),
    );
    expect(getAmenitiesCacheMock).toHaveBeenNthCalledWith(
      2,
      "org-b:schools:70810",
      expect.any(String),
    );
  });

  it("POST uses org-prefixed key and preserves payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-a", orgId: "org-a" });
    upsertAmenitiesCacheMock.mockResolvedValue({
      ok: true,
      data: { ok: true, expires_at: new Date().toISOString() },
      requestId: "rid-3",
      durationMs: 7,
    });

    const req = new NextRequest("http://localhost/api/external/chatgpt-apps/amenities-cache", {
      method: "POST",
      body: JSON.stringify({
        cacheKey: "schools:70810",
        payload: { parks: 5 },
        ttlSeconds: 3600,
      }),
      headers: new Headers({ "content-type": "application/json" }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(upsertAmenitiesCacheMock).toHaveBeenCalledWith(
      "org-a:schools:70810",
      { parks: 5 },
      3600,
      expect.any(String),
    );
  });
});

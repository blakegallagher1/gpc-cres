import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  checkRateLimitMock,
  isDevParcelFallbackEnabledMock,
  getDevFallbackParcelByPropertyDbIdMock,
  getCloudflareAccessHeadersFromEnvMock,
  fetchMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  isDevParcelFallbackEnabledMock: vi.fn(),
  getDevFallbackParcelByPropertyDbIdMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
  fetchMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/server/devParcelFallback", () => ({
  isDevParcelFallbackEnabled: isDevParcelFallbackEnabledMock,
  getDevFallbackParcelByPropertyDbId: getDevFallbackParcelByPropertyDbIdMock,
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

function makeJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/parcels/[parcelId]/geometry", () => {
  let GET: typeof import("./route").GET;
  const originalLocalApiUrl = process.env.LOCAL_API_URL;
  const originalLocalApiKey = process.env.LOCAL_API_KEY;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);

    resolveAuthMock.mockReset();
    checkRateLimitMock.mockReset();
    isDevParcelFallbackEnabledMock.mockReset();
    getDevFallbackParcelByPropertyDbIdMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    fetchMock.mockReset();
    sentryCaptureExceptionMock.mockReset();

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    checkRateLimitMock.mockReturnValue(true);
    isDevParcelFallbackEnabledMock.mockReturnValue(false);
    getDevFallbackParcelByPropertyDbIdMock.mockReturnValue(null);
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({
      "CF-Access-Client-Id": "cf-id",
      "CF-Access-Client-Secret": "cf-secret",
    });

    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";

    ({ GET } = await import("./route"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.LOCAL_API_URL = originalLocalApiUrl;
    process.env.LOCAL_API_KEY = originalLocalApiKey;
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/parcels/abc-123/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the org exceeds the route rate limit", async () => {
    checkRateLimitMock.mockReturnValue(false);

    const res = await GET(
      new Request("http://localhost/api/parcels/abc-123/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error?.code).toBe("RATE_LIMITED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns geometry payload from the gateway", async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        ok: true,
        data: {
          geom_simplified: {
            type: "Polygon",
            coordinates: [[[-91.2, 30.3], [-91.1, 30.3], [-91.1, 30.4], [-91.2, 30.4], [-91.2, 30.3]]],
          },
          bbox: [-91.2, 30.3, -91.1, 30.4],
          area_sqft: 1200,
          centroid: { lat: 30.35, lng: -91.15 },
          srid: 4326,
          dataset_version: "gateway",
        },
      }),
    );

    const res = await GET(
      new Request("http://localhost/api/parcels/ext-abc-123/geometry?detail_level=high"),
      { params: Promise.resolve({ parcelId: "ext-abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.geom_simplified).toContain('"Polygon"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/api/parcels/abc-123/geometry?detail_level=high",
      {
        headers: {
          Authorization: "Bearer test-gateway-key",
          "CF-Access-Client-Id": "cf-id",
          "CF-Access-Client-Secret": "cf-secret",
        },
      },
    );
  });

  it("returns synthetic geometry for dev fallback parcels", async () => {
    isDevParcelFallbackEnabledMock.mockReturnValue(true);
    getDevFallbackParcelByPropertyDbIdMock.mockReturnValue({
      id: "dev-1",
      address: "1201 Government St",
      owner: "Dev Owner",
      acreage: 0.42,
      zoning: "C2",
      floodZone: "X",
      lat: 30.4451,
      lng: -91.1782,
      parish: "East Baton Rouge",
      parcelUid: "dev-uid-1",
      propertyDbId: "dev-uid-1",
    });

    const res = await GET(
      new Request("http://localhost/api/parcels/dev-uid-1/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "dev-uid-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.dataset_version).toBe("dev-fallback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when gateway env is missing", async () => {
    delete process.env.LOCAL_API_URL;
    delete process.env.LOCAL_API_KEY;

    const res = await GET(
      new Request("http://localhost/api/parcels/abc-123/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error?.code).toBe("GATEWAY_UNCONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 404 when the gateway reports no parcel geometry", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const res = await GET(
      new Request("http://localhost/api/parcels/missing/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "missing" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");
  });
});

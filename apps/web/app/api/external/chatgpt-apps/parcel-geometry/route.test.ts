import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  checkRateLimitMock,
  isDevParcelFallbackEnabledMock,
  getDevFallbackParcelByPropertyDbIdMock,
  fetchMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  isDevParcelFallbackEnabledMock: vi.fn(),
  getDevFallbackParcelByPropertyDbIdMock: vi.fn(),
  fetchMock: vi.fn(),
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

vi.mock("@sentry/nextjs", () => ({
  withScope: vi.fn((cb: (scope: { setTags: ReturnType<typeof vi.fn>; setContext: ReturnType<typeof vi.fn> }) => void) => {
    cb({ setTags: vi.fn(), setContext: vi.fn() });
  }),
  captureException: vi.fn(),
}));

const POLYGON_GEOMETRY = {
  type: "Polygon",
  coordinates: [[[-91.2, 30.3], [-91.1, 30.3], [-91.1, 30.4], [-91.2, 30.4], [-91.2, 30.3]]],
};

function makeJsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(""),
  } as unknown as Response;
}

describe("POST /api/external/chatgpt-apps/parcel-geometry", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);

    resolveAuthMock.mockReset();
    checkRateLimitMock.mockReset();
    isDevParcelFallbackEnabledMock.mockReset();
    getDevFallbackParcelByPropertyDbIdMock.mockReset();
    fetchMock.mockReset();

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    checkRateLimitMock.mockReturnValue(true);
    isDevParcelFallbackEnabledMock.mockReturnValue(false);
    getDevFallbackParcelByPropertyDbIdMock.mockReturnValue(null);

    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";

    ({ POST } = await import("./route"));
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc", detailLevel: "low" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input body", async () => {
    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ detailLevel: "low" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns geometry payload from gateway", async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        ok: true,
        data: {
          geom_simplified: POLYGON_GEOMETRY,
          bbox: [-91.2, 30.3, -91.1, 30.4],
          area_sqft: 1200,
          centroid: { lat: 30.35, lng: -91.15 },
          srid: 4326,
          dataset_version: "gateway",
        },
      }),
    );

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty("geom_simplified");
    expect(body.data.geom_simplified).toContain("\"Polygon\"");
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

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "dev-uid-1", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty("geom_simplified");
    expect(body.data.dataset_version).toBe("dev-fallback");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 with GATEWAY_UNCONFIGURED when gateway env is missing", async () => {
    delete process.env.LOCAL_API_URL;
    delete process.env.LOCAL_API_KEY;

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("GATEWAY_UNCONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 200 when gateway geometry is wrapped as FeatureCollection", async () => {
    fetchMock.mockResolvedValue(
      makeJsonResponse({
        ok: true,
        data: {
          geom_simplified: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                geometry: POLYGON_GEOMETRY,
              },
            ],
          },
          bbox: [-91.2, 30.3, -91.1, 30.4],
          area_sqft: 1200,
        },
      }),
    );

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data?.geom_simplified).toContain("\"Polygon\"");
  });

  it("returns 404 when parcel not found in gateway", async () => {
    fetchMock.mockResolvedValue(makeJsonResponse({ ok: false }, 404));

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "nonexistent-parcel", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  it("returns 499 when the client aborts before processing", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
        signal: abortController.signal,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(499);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("CLIENT_ABORTED");
  });
});

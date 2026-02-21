import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  checkRateLimitMock,
  propertyDbRpcMock,
  isDevParcelFallbackEnabledMock,
  getDevFallbackParcelByPropertyDbIdMock,
  getPropertyDbConfigOrNullMock,
  logPropertyDbRuntimeHealthMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  propertyDbRpcMock: vi.fn(),
  isDevParcelFallbackEnabledMock: vi.fn(),
  getDevFallbackParcelByPropertyDbIdMock: vi.fn(),
  getPropertyDbConfigOrNullMock: vi.fn(),
  logPropertyDbRuntimeHealthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@entitlement-os/openai", () => ({
  propertyDbRpc: propertyDbRpcMock,
}));

vi.mock("@/lib/server/devParcelFallback", () => ({
  isDevParcelFallbackEnabled: isDevParcelFallbackEnabledMock,
  getDevFallbackParcelByPropertyDbId: getDevFallbackParcelByPropertyDbIdMock,
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getPropertyDbConfigOrNull: getPropertyDbConfigOrNullMock,
  logPropertyDbRuntimeHealth: logPropertyDbRuntimeHealthMock,
}));

vi.mock("@sentry/nextjs", () => ({
  withScope: vi.fn((cb: (scope: { setTags: vi.Mock; setContext: vi.Mock }) => void) => {
    cb({
      setTags: vi.fn(),
      setContext: vi.fn(),
    });
  }),
  captureException: vi.fn(),
}));

describe("POST /api/external/chatgpt-apps/parcel-geometry", () => {
  let POST: typeof import("./route").POST;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    checkRateLimitMock.mockReset();
    propertyDbRpcMock.mockReset();
    isDevParcelFallbackEnabledMock.mockReset();
    getDevFallbackParcelByPropertyDbIdMock.mockReset();
    getPropertyDbConfigOrNullMock.mockReset();
    logPropertyDbRuntimeHealthMock.mockReturnValue(null);
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    checkRateLimitMock.mockReturnValue(true);
    isDevParcelFallbackEnabledMock.mockReturnValue(false);
    getDevFallbackParcelByPropertyDbIdMock.mockReturnValue(null);
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "https://property-db.example.supabase.co",
      key: "service-role-key",
    });
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

  it("returns geometry payload from Supabase property DB", async () => {
    propertyDbRpcMock.mockImplementation(async (fnName: string, body: Record<string, unknown>) => {
      if (fnName === "api_get_parcel") {
        return [
          {
            id: "abc-123",
            geom_simplified: {
              type: "Polygon",
              coordinates: [[[-91.2, 30.3], [-91.1, 30.3], [-91.1, 30.4], [-91.2, 30.4], [-91.2, 30.3]]],
            },
            bbox: [-91.2, 30.3, -91.1, 30.4],
            area_sqft: 1200,
          },
        ];
      }
      return [];
    });

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
    expect(propertyDbRpcMock).not.toHaveBeenCalled();
  });

  it("returns 503 with PROPERTY_DB_UNCONFIGURED when property DB env is missing", async () => {
    getPropertyDbConfigOrNullMock.mockReturnValue(null);

    const res = await POST(
      new Request("http://localhost/api/external/chatgpt-apps/parcel-geometry", {
        method: "POST",
        body: JSON.stringify({ parcelId: "abc-123", detailLevel: "low" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe("PROPERTY_DB_UNCONFIGURED");
    expect(propertyDbRpcMock).not.toHaveBeenCalled();
  });

  it("returns 200 when property-db geometry is wrapped as FeatureCollection", async () => {
    propertyDbRpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === "api_get_parcel") {
        return [
          {
            id: "abc-123",
            geom_simplified: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: {
                    type: "Polygon",
                    coordinates: [[[-91.2, 30.3], [-91.1, 30.3], [-91.1, 30.4], [-91.2, 30.4], [-91.2, 30.3]]],
                  },
                },
              ],
            },
            bbox: [-91.2, 30.3, -91.1, 30.4],
            area_sqft: 1200,
          },
        ];
      }
      return [];
    });

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

  it("returns 404 when parcel not found in property DB", async () => {
    propertyDbRpcMock.mockResolvedValue([]);

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

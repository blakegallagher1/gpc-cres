import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  checkRateLimitMock,
  getCloudflareAccessHeadersFromEnvMock,
  fetchMock,
  sentryCaptureExceptionMock,
  logPropertyDbRuntimeHealthMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getCloudflareAccessHeadersFromEnvMock: vi.fn(),
  fetchMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  logPropertyDbRuntimeHealthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/server/rateLimiter", () => ({
  checkRateLimit: checkRateLimitMock,
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getCloudflareAccessHeadersFromEnv: getCloudflareAccessHeadersFromEnvMock,
  logPropertyDbRuntimeHealth: logPropertyDbRuntimeHealthMock,
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
  const originalGatewayTimeout = process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", fetchMock);

    resolveAuthMock.mockReset();
    checkRateLimitMock.mockReset();
    getCloudflareAccessHeadersFromEnvMock.mockReset();
    fetchMock.mockReset();
    sentryCaptureExceptionMock.mockReset();
    logPropertyDbRuntimeHealthMock.mockReset();

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    checkRateLimitMock.mockReturnValue(true);
    getCloudflareAccessHeadersFromEnvMock.mockReturnValue({
      "CF-Access-Client-Id": "cf-id",
      "CF-Access-Client-Secret": "cf-secret",
    });

    process.env.LOCAL_API_URL = "https://api.gallagherpropco.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";
    logPropertyDbRuntimeHealthMock.mockReturnValue({
      url: process.env.LOCAL_API_URL,
      key: process.env.LOCAL_API_KEY,
    });

    ({ GET } = await import("./route"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    process.env.LOCAL_API_URL = originalLocalApiUrl;
    process.env.LOCAL_API_KEY = originalLocalApiKey;
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = originalGatewayTimeout;
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
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            parcel_uid: "canonical-123",
            parcel_id: "abc-123",
          },
        }),
      )
      .mockResolvedValueOnce(
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
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/tools/parcel.lookup",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
          "CF-Access-Client-Id": "cf-id",
          "CF-Access-Client-Secret": "cf-secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ parcel_id: "abc-123" }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.gallagherpropco.com/api/parcels/canonical-123/geometry?detail_level=high",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
          "CF-Access-Client-Id": "cf-id",
          "CF-Access-Client-Secret": "cf-secret",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    // Verify cache header on successful geometry response
    expect(res.headers.get("cache-control")).toMatch(/max-age=300/);
  });

  it("uses the canonical parcel id from parcel.lookup before requesting geometry", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            parcel_uid: "canonical-739049",
            parcel_id: "739049",
          },
        }),
      )
      .mockResolvedValueOnce(
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
      new Request("http://localhost/api/parcels/739049/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "739049" }) },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.gallagherpropco.com/api/parcels/canonical-739049/geometry?detail_level=low",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("returns 503 when gateway env is missing", async () => {
    logPropertyDbRuntimeHealthMock.mockReturnValue(null);

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

  it("fails closed when the gateway responds with a server error", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            parcel_uid: "abc-123",
            parcel_id: "abc-123",
          },
        }),
      )
      .mockResolvedValueOnce(new Response("gateway error", { status: 502 }));

    const res = await GET(
      new Request("http://localhost/api/parcels/abc-123/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error?.code).toBe("GATEWAY_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses PROPERTY_DB_GATEWAY_TIMEOUT_MS for gateway requests and captures once", async () => {
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "4321";
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await GET(
      new Request("http://localhost/api/parcels/abc-123/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error?.code).toBe("GATEWAY_UNAVAILABLE");
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4321);
    expect(sentryCaptureExceptionMock).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
  });

  it("returns 404 when the gateway reports no parcel geometry", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const res = await GET(
      new Request("http://localhost/api/parcels/missing/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "missing" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("GEOMETRY_UNAVAILABLE");
    expect(body.error?.message).toBe("Parcel geometry unavailable");
    expect(String(infoSpy.mock.calls[0]?.[0] ?? "")).toContain(
      "Parcel geometry gateway returned no row",
    );
    expect(String(infoSpy.mock.calls[0]?.[0] ?? "")).toContain("\"parcelId\":\"missing\"");
    expect(String(infoSpy.mock.calls[0]?.[0] ?? "")).toContain("\"detailLevel\":\"low\"");
    expect(String(infoSpy.mock.calls[0]?.[0] ?? "")).toContain("\"status\":404");
    infoSpy.mockRestore();
  });

  it("returns 404 with a separate log when the gateway row cannot be parsed", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            parcel_uid: "unparseable",
            parcel_id: "unparseable",
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            bbox: [-91.2, 30.3, -91.1, 30.4],
            area_sqft: 1200,
            srid: 4326,
            dataset_version: "gateway",
          },
        }),
      );

    const res = await GET(
      new Request("http://localhost/api/parcels/unparseable/geometry?detail_level=low"),
      { params: Promise.resolve({ parcelId: "unparseable" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("GEOMETRY_UNAVAILABLE");
    expect(body.error?.message).toBe("Parcel geometry unavailable");
    expect(warnSpy).toHaveBeenCalledWith(
      "[parcel-geometry] gateway row could not be parsed into usable geometry",
      expect.objectContaining({
        parcelId: "unparseable",
        detailLevel: "low",
        bboxType: "array",
        geomSimplifiedType: "undefined",
        geometryType: "undefined",
        geomType: "undefined",
        rowKeys: expect.arrayContaining(["bbox", "area_sqft", "srid", "dataset_version"]),
      }),
    );
    warnSpy.mockRestore();
  });
});

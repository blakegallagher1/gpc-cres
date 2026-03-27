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

describe("GET /api/parcels/[parcelId]/screening", () => {
  let GET: typeof import("./route").GET;
  const originalLocalApiUrl = process.env.LOCAL_API_URL;
  const originalLocalApiKey = process.env.LOCAL_API_KEY;

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
    process.env.LOCAL_API_URL = originalLocalApiUrl;
    process.env.LOCAL_API_KEY = originalLocalApiKey;
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new Request("http://localhost/api/parcels/ext-abc-123/screening"),
      { params: Promise.resolve({ parcelId: "ext-abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error?.code).toBe("UNAUTHORIZED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves the canonical parcel id before building the screening SQL", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          data: {
            id: "00001e98-979c-485a-b71d-69c4f817dd70",
            parcel_uid: "007-3904-9",
          },
        }),
      )
      .mockResolvedValueOnce(
        makeJsonResponse({
          ok: true,
          rows: [
            {
              parcel_id: "007-3904-9",
              address: "2774 HIGHLAND RD",
              flood_zone_count: 1,
              in_sfha: true,
              soil_unit_count: 3,
              has_hydric: false,
              wetland_count: 0,
              has_wetlands: false,
              epa_1mi: 2,
            },
          ],
        }),
      );

    const res = await GET(
      new Request("http://localhost/api/parcels/ext-00001e98-979c-485a-b71d-69c4f817dd70/screening"),
      {
        params: Promise.resolve({
          parcelId: "ext-00001e98-979c-485a-b71d-69c4f817dd70",
        }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toMatchObject({
      parcel_id: "007-3904-9",
      address: "2774 HIGHLAND RD",
      in_sfha: true,
      flood_zone_count: 1,
      soil_unit_count: 3,
      epa_facility_count: 2,
      has_environmental_constraints: true,
      has_nearby_epa_facilities: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.gallagherpropco.com/tools/parcel.lookup",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-gateway-key",
          "CF-Access-Client-Id": "cf-id",
          "CF-Access-Client-Secret": "cf-secret",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ parcel_id: "00001e98-979c-485a-b71d-69c4f817dd70" }),
      }),
    );

    const screeningCall = fetchMock.mock.calls[1];
    expect(screeningCall[0]).toBe("https://api.gallagherpropco.com/tools/parcels.sql");
    const screeningBody = JSON.parse(String((screeningCall[1] as RequestInit).body)) as {
      sql: string;
    };
    expect(screeningBody.sql).toContain("WHERE p.parcel_id = '007-3904-9'");
    expect(screeningBody.sql).not.toContain("00001e98-979c-485a-b71d-69c4f817dd70");
  });

  it("falls back to the raw parcel id when lookup does not return a canonical id", async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse({ ok: true, data: { id: "abc-123" } }))
      .mockResolvedValueOnce(makeJsonResponse({ ok: true, rows: [] }));

    const res = await GET(
      new Request("http://localhost/api/parcels/ext-abc-123/screening"),
      { params: Promise.resolve({ parcelId: "ext-abc-123" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");

    const screeningCall = fetchMock.mock.calls[1];
    const screeningBody = JSON.parse(String((screeningCall[1] as RequestInit).body)) as {
      sql: string;
    };
    expect(screeningBody.sql).toContain("WHERE p.parcel_id = 'abc-123'");
  });
});

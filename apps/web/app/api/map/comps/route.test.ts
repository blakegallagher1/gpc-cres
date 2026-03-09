import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/map/comps", () => {
  const fetchMock = vi.fn();
  const priorEnv = {
    url: process.env.LOCAL_API_URL,
    key: process.env.LOCAL_API_KEY,
    accessClientId: process.env.CF_ACCESS_CLIENT_ID,
    accessClientSecret: process.env.CF_ACCESS_CLIENT_SECRET,
    gatewayTimeout: process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS,
  };

  beforeEach(() => {
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    // Route short-circuits RPC calls if env is missing.
    process.env.LOCAL_API_URL = "http://property-db.test";
    process.env.LOCAL_API_KEY = "test-key";
    process.env.CF_ACCESS_CLIENT_ID = "client-id.access";
    process.env.CF_ACCESS_CLIENT_SECRET = "client-secret";
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "";
  });

  afterEach(() => {
    process.env.LOCAL_API_URL = priorEnv.url;
    process.env.LOCAL_API_KEY = priorEnv.key;
    process.env.CF_ACCESS_CLIENT_ID = priorEnv.accessClientId;
    process.env.CF_ACCESS_CLIENT_SECRET = priorEnv.accessClientSecret;
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = priorEnv.gatewayTimeout;
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth has no org scope", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: "" });

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 when address or lat/lng is missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/map/comps");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
  });

  it("returns comparable sales with derived price fields", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        data: [
          {
            id: "parcel-1",
            site_address: "123 Main St",
            latitude: 30.45,
            longitude: -91.19,
            sale_price: 435600,
            acreage: 10,
            sale_date: "2025-11-15",
            use_code: "IND",
          },
        ],
      }),
    } as Response);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body.comps).toHaveLength(1);
    expect(body.comps[0]).toMatchObject({
      id: "parcel-1",
      address: "123 Main St",
      pricePerAcre: 43560,
      pricePerSf: 1,
      useType: "IND",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/parcels/search?");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({
        Authorization: "Bearer test-key",
        "CF-Access-Client-Id": "client-id.access",
        "CF-Access-Client-Secret": "client-secret",
        "x-request-id": expect.any(String),
      }),
    });
  });

  it("uses parcel.point fallback for lat/lng queries when text search has no matches", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: [] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          parcels: [
            {
              parcel_id: "POINT-1",
              address: "Nearby Parcel",
              lat: 30.45,
              lng: -91.19,
            },
          ],
        }),
      } as Response);

    const req = new NextRequest("http://localhost/api/map/comps?lat=30.45&lng=-91.19");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comps).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://property-db.test/tools/parcel.point");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });

  it("returns degraded empty comps when gateway configuration is missing", async () => {
    process.env.LOCAL_API_URL = "";
    process.env.LOCAL_API_KEY = "";
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.comps).toEqual([]);
    expect(body.code).toBe("GATEWAY_UNCONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns degraded empty comps when upstream responds with error", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad upstream",
    } as Response);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.warning).toContain("Property database unavailable");
    expect(body.comps).toEqual([]);
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
  });

  it("returns degraded empty comps for invalid payload shape", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, unexpected: [] }),
    } as Response);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.comps).toEqual([]);
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
  });

  it("returns degraded empty comps when upstream request times out", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    process.env.PROPERTY_DB_GATEWAY_TIMEOUT_MS = "1234";
    const abortError = Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
    fetchMock.mockRejectedValue(abortError);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.comps).toEqual([]);
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  beforeEach(() => {
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
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
      json: async () => [
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
    } as Response);

    const req = new NextRequest("http://localhost/api/map/comps?address=123+Main+St");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.comps).toHaveLength(1);
    expect(body.comps[0]).toMatchObject({
      id: "parcel-1",
      address: "123 Main St",
      pricePerAcre: 43560,
      pricePerSf: 1,
      useType: "IND",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

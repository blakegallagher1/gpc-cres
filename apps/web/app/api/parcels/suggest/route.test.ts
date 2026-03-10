import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, findManyMock, fetchMock, getPropertyDbConfigOrNullMock } =
  vi.hoisted(() => ({
    resolveAuthMock: vi.fn(),
    findManyMock: vi.fn(),
    fetchMock: vi.fn(),
    getPropertyDbConfigOrNullMock: vi.fn(),
  }));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prismaRead: {
    parcel: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/server/propertyDbEnv", () => ({
  getPropertyDbConfigOrNull: getPropertyDbConfigOrNullMock,
  getCloudflareAccessHeadersFromEnv: () => ({}),
}));

vi.stubGlobal("fetch", fetchMock);

describe("GET /api/parcels/suggest", () => {
  let GET: typeof import("./route").GET;

  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    findManyMock.mockReset();
    fetchMock.mockReset();
    getPropertyDbConfigOrNullMock.mockReturnValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/parcels/suggest?q=7618");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when limit is invalid", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "o-1",
    });
    const req = new NextRequest("http://localhost/api/parcels/suggest?q=7618&limit=0");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid limit" });
  });

  it("returns empty suggestions for short queries without hitting DB", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "o-1",
    });
    const req = new NextRequest("http://localhost/api/parcels/suggest?q=7");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ suggestions: [] });
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("returns org-scoped ranked suggestions", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    findManyMock.mockResolvedValue([
      {
        id: "p-2",
        address: "7618 Copperfield Court, Baton Rouge, LA",
        lat: 30.41,
        lng: -91.11,
        propertyDbId: "uid-2",
      },
      {
        id: "p-1",
        address: "7618 Copperfield Ct, Baton Rouge, LA",
        lat: 30.42,
        lng: -91.12,
        propertyDbId: "uid-1",
      },
    ]);

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=7618%20copperfield&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].address).toContain("7618 Copperfield");
    expect(findManyMock).toHaveBeenCalledTimes(1);
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-123",
        }),
      }),
    );
    // Gateway should NOT be called when org results exist
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to contains matching when prefix query misses", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    findManyMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "p-3",
          address: "1234 West Copperfield Court",
          lat: "30.40",
          lng: "-91.10",
          propertyDbId: "uid-3",
        },
      ]);

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=copperfield&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].address).toContain("Copperfield");
    expect(body.suggestions[0].lat).toBe(30.4);
    expect(findManyMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to gateway when org results are empty", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    // Both prefix and contains queries return empty
    findManyMock.mockResolvedValue([]);
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "https://api.test.com",
      key: "test-key",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        count: 2,
        data: [
          {
            id: "a1b2c3d4-0000-0000-0000-000000000001",
            parcel_uid: "016-1234-0",
            situs_address: "4400 HEATH DR",
            lat: 30.60,
            lng: -91.15,
          },
          {
            id: "a1b2c3d4-0000-0000-0000-000000000002",
            parcel_uid: "016-1234-1",
            situs_address: "4402 HEATH DR",
            lat: 30.61,
            lng: -91.16,
          },
        ],
      }),
    });

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=4400+Heath&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toHaveLength(2);
    expect(body.suggestions[0].address).toBe("4400 HEATH DR");
    expect(body.suggestions[0].source).toBe("property_db");
    expect(body.suggestions[0].lat).toBe(30.6);
    expect(body.suggestions[0].lng).toBe(-91.15);
    expect(body.suggestions[0].propertyDbId).toBe("016-1234-0");
    // Gateway candidates now fire in parallel — at least 1 call, up to 2
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("returns empty when both org and gateway have no results", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    findManyMock.mockResolvedValue([]);
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "https://api.test.com",
      key: "test-key",
    });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, count: 0, data: [] }),
    });

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=zzzzz&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
  });

  it("gracefully handles gateway errors", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    findManyMock.mockResolvedValue([]);
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "https://api.test.com",
      key: "test-key",
    });
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=Airline&limit=5");
    const res = await GET(req);
    const body = await res.json();

    // Should return 200 with empty suggestions, not 5xx
    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
  });

  it("returns cache-control header on successful response", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({ userId: "u-1", orgId: "org-123" });
    findManyMock.mockResolvedValue([
      { id: "p-1", address: "123 Main St", lat: 30.4, lng: -91.1, propertyDbId: "uid-1" },
    ]);

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=123+main");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/max-age=15/);
  });

  it("fires gateway candidates in parallel when org is empty", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({ userId: "u-1", orgId: "org-123" });
    findManyMock.mockResolvedValue([]);
    getPropertyDbConfigOrNullMock.mockReturnValue({
      url: "https://api.test.com",
      key: "test-key",
    });
    // Both parallel candidates return results — we should use the first non-empty one
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ situs_address: "100 AIRLINE HWY", parcel_uid: "pdb-1", lat: 30.5, lng: -91.1 }],
      }),
    });

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=airline+highway&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions.length).toBeGreaterThan(0);
    // Parallel: up to 2 candidates fired simultaneously
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("skips gateway when config is missing", async () => {
    ({ GET } = await import("./route"));
    resolveAuthMock.mockResolvedValue({
      userId: "u-1",
      orgId: "org-123",
    });
    findManyMock.mockResolvedValue([]);
    getPropertyDbConfigOrNullMock.mockReturnValue(null);

    const req = new NextRequest("http://localhost/api/parcels/suggest?q=Airline&limit=5");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.suggestions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  updateProspectsForRouteMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  updateProspectsForRouteMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  searchProspectsForRoute: vi.fn(),
  updateProspectsForRoute: updateProspectsForRouteMock,
}));

describe("PUT /api/map/prospect", () => {
  let PUT: typeof import("./route").PUT;

  beforeEach(async () => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    updateProspectsForRouteMock.mockReset();
    // Supabase env vars no longer needed after gateway reroute, but keep
    // for any code paths that may still reference them indirectly.
    ({ PUT } = await import("./route"));
  });

  it("creates deals on the happy path using org-scoped jurisdictions", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    updateProspectsForRouteMock.mockResolvedValue({
      status: 200,
      body: { created: ["deal-1"], count: 1 },
      upstream: "org",
      resultCount: 1,
      details: { action: "create-deals", parcelCount: 1, parcelIdCount: 0 },
    });

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "East Baton Rouge",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ created: ["deal-1"], count: 1 });
    expect(updateProspectsForRouteMock).toHaveBeenCalledTimes(1);
  });

  it("rejects create-deals when no org-scoped default jurisdiction is available", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    updateProspectsForRouteMock.mockResolvedValue({
      status: 400,
      body: { error: "No jurisdiction configured" },
      upstream: "org",
      resultCount: 0,
      details: { validationError: "missing_jurisdiction" },
    });

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "East Baton Rouge",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "No jurisdiction configured" });
    expect(updateProspectsForRouteMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the org default jurisdiction when parish-specific lookup misses", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    updateProspectsForRouteMock.mockResolvedValue({
      status: 200,
      body: { created: ["deal-1"], count: 1 },
      upstream: "org",
      resultCount: 1,
      details: { action: "create-deals", parcelCount: 1, parcelIdCount: 0 },
    });

    const req = new NextRequest("http://localhost/api/map/prospect", {
      method: "PUT",
      body: JSON.stringify({
        action: "create-deals",
        parcels: [
          {
            id: "p-1",
            address: "123 Main St",
            lat: 30.45,
            lng: -91.18,
            acreage: 1.5,
            zoning: "C2",
            floodZone: "X",
            parish: "Unknown Parish",
          },
        ],
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ created: ["deal-1"], count: 1 });
    expect(updateProspectsForRouteMock).toHaveBeenCalledTimes(1);
  });
});

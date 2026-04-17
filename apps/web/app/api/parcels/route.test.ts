import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeApiRouteMock, searchParcelsForRouteMock, capturePropertyObservationsMock } = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  searchParcelsForRouteMock: vi.fn(),
  capturePropertyObservationsMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server", () => ({
  searchParcelsForRoute: searchParcelsForRouteMock,
  capturePropertyObservations: capturePropertyObservationsMock,
}));

import { GET } from "./route";

describe("GET /api/parcels", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    searchParcelsForRouteMock.mockReset();
    capturePropertyObservationsMock.mockReset();
    capturePropertyObservationsMock.mockResolvedValue({ captured: 1 });
  });

  it("returns 401 when unauthorized", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });

    const res = await GET(new NextRequest("http://localhost/api/parcels"));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(searchParcelsForRouteMock).not.toHaveBeenCalled();
  });

  it("returns parcel payloads from the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    searchParcelsForRouteMock.mockResolvedValue({
      status: 200,
      body: {
        parcels: [{ id: "UID1", parcelId: "UID1", address: "123 Main St" }],
        source: "org",
      },
      cacheControl: "private, max-age=30",
      upstream: "org",
      resultCount: 1,
      details: { source: "org" },
    });

    const res = await GET(new NextRequest("http://localhost/api/parcels"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=30");
    expect(body).toEqual({
      parcels: [{ id: "UID1", parcelId: "UID1", address: "123 Main St" }],
      source: "org",
    });
    expect(searchParcelsForRouteMock).toHaveBeenCalledWith({
      orgId: "org-1",
      hasCoords: false,
      searchText: "",
    });
    expect(capturePropertyObservationsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        orgId: "org-1",
        observationType: "parcel_lookup",
        parcelId: "UID1",
        address: "123 Main St",
        sourceRoute: "/api/parcels",
      }),
    ]);
  });

  it("preserves degraded gateway fallback responses", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    searchParcelsForRouteMock.mockResolvedValue({
      status: 200,
      body: {
        parcels: [{ id: "UID2", parcelId: "UID2", address: "456 River Rd" }],
        source: "org-fallback",
        degraded: true,
        warning: "Property database unavailable; returned org-scoped fallback parcels.",
      },
      upstream: "org-fallback",
      resultCount: 1,
      details: { degraded: true },
    });

    const res = await GET(
      new NextRequest("http://localhost/api/parcels?hasCoords=true&search=river"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.source).toBe("org-fallback");
    expect(searchParcelsForRouteMock).toHaveBeenCalledWith({
      orgId: "org-1",
      hasCoords: true,
      searchText: "river",
    });
    expect(capturePropertyObservationsMock).toHaveBeenCalled();
  });

  it("preserves explicit service errors", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    searchParcelsForRouteMock.mockResolvedValue({
      status: 503,
      body: { error: "Property database unavailable", code: "GATEWAY_UNAVAILABLE" },
      upstream: "property-db",
      resultCount: 0,
      details: { gatewayConfigured: false },
    });

    const res = await GET(new NextRequest("http://localhost/api/parcels?hasCoords=true"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Property database unavailable",
      code: "GATEWAY_UNAVAILABLE",
    });
    expect(capturePropertyObservationsMock).not.toHaveBeenCalled();
  });
});

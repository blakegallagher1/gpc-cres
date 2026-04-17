import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeApiRouteMock, searchProspectsForRouteMock, capturePropertyObservationsMock } = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  searchProspectsForRouteMock: vi.fn(),
  capturePropertyObservationsMock: vi.fn(),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server", () => ({
  searchProspectsForRoute: searchProspectsForRouteMock,
  updateProspectsForRoute: vi.fn(),
  capturePropertyObservations: capturePropertyObservationsMock,
}));

import { POST } from "./route";

describe("POST /api/map/prospect", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    searchProspectsForRouteMock.mockReset();
    capturePropertyObservationsMock.mockReset();
    capturePropertyObservationsMock.mockResolvedValue({ captured: 1 });
  });

  it("returns 401 when unauthorized", async () => {
    authorizeApiRouteMock.mockResolvedValue({ ok: true, auth: null });

    const res = await POST(
      new NextRequest("http://localhost/api/map/prospect", {
        method: "POST",
        body: JSON.stringify({ polygon: { coordinates: [] } }),
      }),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns 400 for invalid JSON", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/map/prospect", {
        method: "POST",
        body: "{invalid",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(searchProspectsForRouteMock).not.toHaveBeenCalled();
  });

  it("passes successful prospect search payloads through from the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    searchProspectsForRouteMock.mockResolvedValue({
      status: 200,
      body: {
        parcels: [{ id: "p-1", address: "123 Main St" }],
        total: 1,
      },
      upstream: "property-db",
      resultCount: 1,
      details: { gatewayRowCount: 1, parcelCount: 1 },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/map/prospect", {
        method: "POST",
        body: JSON.stringify({
          polygon: {
            coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
          },
          filters: { searchText: "Main" },
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      parcels: [{ id: "p-1", address: "123 Main St" }],
      total: 1,
    });
    expect(searchProspectsForRouteMock).toHaveBeenCalledTimes(1);
    expect(capturePropertyObservationsMock).toHaveBeenCalledWith([
      expect.objectContaining({
        orgId: "org-1",
        observationType: "prospect_match",
        parcelId: "p-1",
        address: "123 Main St",
        sourceRoute: "/api/map/prospect",
      }),
    ]);
  });

  it("passes gateway failure responses through from the package seam", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    searchProspectsForRouteMock.mockResolvedValue({
      status: 503,
      body: {
        error: "Property database unavailable",
        code: "GATEWAY_UNAVAILABLE",
      },
      upstream: "property-db",
      resultCount: 0,
      details: { errorCode: "GATEWAY_UNAVAILABLE" },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/map/prospect", {
        method: "POST",
        body: JSON.stringify({
          polygon: {
            coordinates: [[[-91.2, 30.45], [-91.2, 30.35], [-91.1, 30.35], [-91.1, 30.45], [-91.2, 30.45]]],
          },
        }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Property database unavailable",
      code: "GATEWAY_UNAVAILABLE",
    });
    expect(capturePropertyObservationsMock).not.toHaveBeenCalled();
  });
});

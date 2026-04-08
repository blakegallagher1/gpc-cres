import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findDealParcelEnrichmentMatchesMock,
  applyDealParcelEnrichmentMock,
  ParcelNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findDealParcelEnrichmentMatchesMock: vi.fn(),
  applyDealParcelEnrichmentMock: vi.fn(),
  ParcelNotFoundErrorMock: class ParcelNotFoundError extends Error {
    constructor() {
      super("Parcel not found");
      this.name = "ParcelNotFoundError";
    }
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  findDealParcelEnrichmentMatches: findDealParcelEnrichmentMatchesMock,
  applyDealParcelEnrichment: applyDealParcelEnrichmentMock,
  ParcelNotFoundError: ParcelNotFoundErrorMock,
}));

async function loadRoute() {
  return import("./route");
}

describe("POST /api/deals/[id]/parcels/[parcelId]/enrich", () => {
  beforeEach(() => {
    vi.resetModules();
    resolveAuthMock.mockReset();
    findDealParcelEnrichmentMatchesMock.mockReset();
    applyDealParcelEnrichmentMock.mockReset();

    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deals/deal-1/parcels/parcel-1/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search" }),
      }) as never,
      { params: Promise.resolve({ id: "deal-1", parcelId: "parcel-1" }) },
    );

    expect(res.status).toBe(401);
    expect(findDealParcelEnrichmentMatchesMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the parcel is not found for the scoped deal", async () => {
    findDealParcelEnrichmentMatchesMock.mockRejectedValue(
      new ParcelNotFoundErrorMock(),
    );
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deals/deal-1/parcels/parcel-1/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search" }),
      }) as never,
      { params: Promise.resolve({ id: "deal-1", parcelId: "parcel-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Parcel not found" });
  });

  it("returns search matches from the gateway-backed enrichment helper", async () => {
    findDealParcelEnrichmentMatchesMock.mockResolvedValue({
      matches: [{ id: "prop-1", site_address: "123 Main St" }],
      address: "123 Main St",
    });
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deals/deal-1/parcels/parcel-1/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search" }),
      }) as never,
      { params: Promise.resolve({ id: "deal-1", parcelId: "parcel-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      matches: [{ id: "prop-1", site_address: "123 Main St" }],
      address: "123 Main St",
    });
    expect(findDealParcelEnrichmentMatchesMock).toHaveBeenCalledWith({
      dealId: "deal-1",
      orgId: "org-1",
      parcelId: "parcel-1",
    });
  });

  it("returns 400 when apply is requested without a propertyDbId", async () => {
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deals/deal-1/parcels/parcel-1/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      }) as never,
      { params: Promise.resolve({ id: "deal-1", parcelId: "parcel-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "propertyDbId is required" });
    expect(applyDealParcelEnrichmentMock).not.toHaveBeenCalled();
  });

  it("applies enrichment and returns the updated parcel plus screening", async () => {
    applyDealParcelEnrichmentMock.mockResolvedValue({
      screening: { flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] } },
      parcel: { id: "parcel-1", propertyDbId: "prop-1", apn: "015-4249-4" },
    });
    const { POST } = await loadRoute();

    const res = await POST(
      new Request("http://localhost/api/deals/deal-1/parcels/parcel-1/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", propertyDbId: "prop-1" }),
      }) as never,
      { params: Promise.resolve({ id: "deal-1", parcelId: "parcel-1" }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(applyDealParcelEnrichmentMock).toHaveBeenCalledWith({
      dealId: "deal-1",
      orgId: "org-1",
      parcelId: "parcel-1",
      propertyDbId: "prop-1",
    });
    expect(body).toEqual({
      parcel: { id: "parcel-1", propertyDbId: "prop-1", apn: "015-4249-4" },
      screening: { flood: { zones: [{ zone_code: "X", overlap_pct: 100 }] } },
    });
  });
});

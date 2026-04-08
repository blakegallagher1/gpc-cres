import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealParcelsMock,
  createDealParcelMock,
  dispatchEventMock,
  captureAutomationDispatchErrorMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listDealParcelsMock: vi.fn(),
  createDealParcelMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  captureAutomationDispatchErrorMock: vi.fn(),
  DealAccessErrorMock: class DealAccessError extends Error {
    constructor(status) {
      super(status === 403 ? "Forbidden" : "Deal not found");
      this.name = "DealAccessError";
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listDealParcels: listDealParcelsMock,
  createDealParcel: createDealParcelMock,
  DealAccessError: DealAccessErrorMock,
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureAutomationDispatchError: captureAutomationDispatchErrorMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

import { GET, POST } from "./route";

const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/deals/[id]/parcels", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealParcelsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/parcels`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealParcelsMock).not.toHaveBeenCalled();
  });

  it("returns scoped parcels through the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealParcelsMock.mockResolvedValue([{ id: "parcel-1", address: "123 Main St" }]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/parcels`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.parcels).toEqual([{ id: "parcel-1", address: "123 Main St" }]);
    expect(listDealParcelsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("POST /api/deals/[id]/parcels", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createDealParcelMock.mockReset();
    dispatchEventMock.mockReset();
  });

  it("returns 400 when address is missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/parcels`, {
      method: "POST",
      body: JSON.stringify({ apn: "123-456" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "address is required" });
    expect(createDealParcelMock).not.toHaveBeenCalled();
  });

  it("creates the parcel and dispatches parcel.created", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealParcelMock.mockResolvedValue({ id: "parcel-1", address: "123 Main St" });
    dispatchEventMock.mockResolvedValue(undefined);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/parcels`, {
      method: "POST",
      body: JSON.stringify({ address: "123 Main St", apn: "123-456" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.parcel).toEqual({ id: "parcel-1", address: "123 Main St" });
    expect(createDealParcelMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      input: expect.objectContaining({ address: "123 Main St", apn: "123-456" }),
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "parcel.created",
      dealId: DEAL_ID,
      parcelId: "parcel-1",
      orgId: ORG_ID,
    });
  });
});

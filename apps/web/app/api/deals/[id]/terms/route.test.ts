import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealTermsMock,
  upsertDealTermsMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealTermsMock: vi.fn(),
  upsertDealTermsMock: vi.fn(),
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
  getDealTerms: getDealTermsMock,
  upsertDealTerms: upsertDealTermsMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const TERMS_RECORD = {
  id: "55555555-5555-4555-8555-555555555555",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  offerPrice: 1250000,
  earnestMoney: 25000,
  closingDate: "2026-02-20T00:00:00.000Z",
  titleCompany: "Prime Title",
  dueDiligenceDays: 30,
  financingContingencyDays: 14,
  loiSignedAt: "2026-01-15T00:00:00.000Z",
  psaSignedAt: "2026-01-18T00:00:00.000Z",
  titleReviewDue: "2026-01-25T00:00:00.000Z",
  surveyDue: "2026-01-28T00:00:00.000Z",
  environmentalDue: "2026-02-01T00:00:00.000Z",
  sellerContact: "seller@example.com",
  brokerContact: "broker@example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const TERMS_RESPONSE = {
  ...TERMS_RECORD,
  offerPrice: "1250000",
  earnestMoney: "25000",
};

describe("GET /api/deals/[id]/terms", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealTermsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealTermsMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealTermsMock.mockRejectedValue(new DealAccessErrorMock(403));

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns 400 when deal id is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/deals/not-a-uuid/terms");
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid deal id");
    expect(getDealTermsMock).not.toHaveBeenCalled();
  });

  it("returns terms when present and returns null when absent", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealTermsMock.mockResolvedValue({ terms: { ...TERMS_RESPONSE } });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.terms).toMatchObject({
      id: TERMS_RECORD.id,
      offerPrice: "1250000",
      earnestMoney: "25000",
      titleCompany: "Prime Title",
      dueDiligenceDays: 30,
      closingDate: TERMS_RECORD.closingDate,
    });
    expect(getDealTermsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("PUT /api/deals/[id]/terms", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    upsertDealTermsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`, {
      method: "PUT",
      body: JSON.stringify({ offerPrice: 1500000 }),
    });

    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(upsertDealTermsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid terms payload");
    expect(upsertDealTermsMock).not.toHaveBeenCalled();
  });

  it("upserts terms for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    upsertDealTermsMock.mockResolvedValue({
      terms: { ...TERMS_RESPONSE, offerPrice: "1500000" },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/terms`, {
      method: "PUT",
      body: JSON.stringify({
        offerPrice: 1500000,
        closingDate: "2026-02-20T00:00:00.000Z",
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.terms.offerPrice).toBe("1500000");
    expect(body.terms.closingDate).toBe("2026-02-20T00:00:00.000Z");
    expect(upsertDealTermsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      payload: expect.objectContaining({
        offerPrice: 1500000,
        closingDate: new Date("2026-02-20T00:00:00.000Z"),
      }),
    });
  });
});

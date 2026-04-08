import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealFinancingsMock,
  createDealFinancingMock,
  updateDealFinancingMock,
  deleteDealFinancingMock,
  DealAccessErrorMock,
  DealFinancingNotFoundErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listDealFinancingsMock: vi.fn(),
  createDealFinancingMock: vi.fn(),
  updateDealFinancingMock: vi.fn(),
  deleteDealFinancingMock: vi.fn(),
  DealAccessErrorMock: class DealAccessError extends Error {
    constructor(status) {
      super(status === 403 ? "Forbidden" : "Deal not found");
      this.name = "DealAccessError";
      this.status = status;
    }
  },
  DealFinancingNotFoundErrorMock: class DealFinancingNotFoundError extends Error {
    constructor() {
      super("Financing not found");
      this.name = "DealFinancingNotFoundError";
    }
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  listDealFinancings: listDealFinancingsMock,
  createDealFinancing: createDealFinancingMock,
  updateDealFinancing: updateDealFinancingMock,
  deleteDealFinancing: deleteDealFinancingMock,
  DealAccessError: DealAccessErrorMock,
  DealFinancingNotFoundError: DealFinancingNotFoundErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const FINANCING_RECORD = {
  id: "55555555-5555-4555-8555-555555555555",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  lenderName: "First National Bank",
  facilityName: "Acquisition Facility",
  loanType: "Construction",
  loanAmount: "2500000",
  commitmentDate: "2026-01-01T00:00:00.000Z",
  fundedDate: "2026-01-15T00:00:00.000Z",
  interestRate: "7.25",
  loanTermMonths: 360,
  amortizationYears: 30,
  ltvPercent: "0.65",
  dscrRequirement: "1.25",
  originationFeePercent: "1.5",
  sourceUploadId: null,
  status: "in-review",
  notes: "Initial term sheet",
  createdAt: "2026-01-20T00:00:00.000Z",
  updatedAt: "2026-01-20T00:00:00.000Z",
};

describe("GET /api/deals/[id]/financings", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealFinancingsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealFinancingsMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealFinancingsMock.mockRejectedValue(new DealAccessErrorMock(403));

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns 400 when deal id is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/deals/not-a-uuid/financings");
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid deal id");
    expect(listDealFinancingsMock).not.toHaveBeenCalled();
  });

  it("returns financings for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealFinancingsMock.mockResolvedValue([{ ...FINANCING_RECORD }]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.financings).toEqual([
      {
        ...FINANCING_RECORD,
        loanAmount: "2500000",
        interestRate: "7.25",
        ltvPercent: "0.65",
        dscrRequirement: "1.25",
        originationFeePercent: "1.5",
      },
    ]);
    expect(listDealFinancingsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("POST /api/deals/[id]/financings", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createDealFinancingMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`, {
      method: "POST",
      body: JSON.stringify({ lenderName: "First National Bank" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(createDealFinancingMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid financing payload");
    expect(createDealFinancingMock).not.toHaveBeenCalled();
  });

  it("creates financing for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealFinancingMock.mockResolvedValue({ ...FINANCING_RECORD });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financings`, {
      method: "POST",
      body: JSON.stringify({ lenderName: "First National Bank", loanAmount: 2500000 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.financing.lenderName).toBe("First National Bank");
    expect(createDealFinancingMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      input: {
        lenderName: "First National Bank",
        loanAmount: 2500000,
      },
    });
  });
});

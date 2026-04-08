import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealDebtComparisonsMock,
  saveDealDebtComparisonsMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealDebtComparisonsMock: vi.fn(),
  saveDealDebtComparisonsMock: vi.fn(),
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
  getDealDebtComparisons: getDealDebtComparisonsMock,
  saveDealDebtComparisons: saveDealDebtComparisonsMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, PUT } from "./route";

const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/deals/[id]/debt-comparison", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealDebtComparisonsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/debt-comparison`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealDebtComparisonsMock).not.toHaveBeenCalled();
  });

  it("returns saved loans for the scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealDebtComparisonsMock.mockResolvedValue([{ id: "loan-1", lender: "Bank" }]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/debt-comparison`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.loans).toEqual([{ id: "loan-1", lender: "Bank" }]);
    expect(getDealDebtComparisonsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("PUT /api/deals/[id]/debt-comparison", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    saveDealDebtComparisonsMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/debt-comparison`, {
      method: "PUT",
      body: JSON.stringify({ loans: null }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid loans payload" });
    expect(saveDealDebtComparisonsMock).not.toHaveBeenCalled();
  });

  it("saves loans through the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const loans = [{ id: "loan-1", lender: "Bank" }];
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/debt-comparison`, {
      method: "PUT",
      body: JSON.stringify({ loans }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(saveDealDebtComparisonsMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      entries: loans,
    });
  });
});

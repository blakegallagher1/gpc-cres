import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealFinancialModelScenariosMock,
  saveDealFinancialModelScenariosMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealFinancialModelScenariosMock: vi.fn(),
  saveDealFinancialModelScenariosMock: vi.fn(),
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
  getDealFinancialModelScenarios: getDealFinancialModelScenariosMock,
  saveDealFinancialModelScenarios: saveDealFinancialModelScenariosMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, PUT } from "./route";

const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/deals/[id]/scenarios", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealFinancialModelScenariosMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/scenarios`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealFinancialModelScenariosMock).not.toHaveBeenCalled();
  });

  it("returns scenarios for the scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealFinancialModelScenariosMock.mockResolvedValue([
      { id: "scenario-1", name: "Base", assumptions: { exitCap: 0.06 }, createdAt: "2026-01-01" },
    ]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/scenarios`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scenarios).toHaveLength(1);
    expect(getDealFinancialModelScenariosMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("PUT /api/deals/[id]/scenarios", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    saveDealFinancialModelScenariosMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/scenarios`, {
      method: "PUT",
      body: JSON.stringify({ scenarios: "bad" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid scenarios payload" });
    expect(saveDealFinancialModelScenariosMock).not.toHaveBeenCalled();
  });

  it("saves scenarios through the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const scenarios = [{ id: "scenario-1", assumptions: { exitCap: 0.06 } }];
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/scenarios`, {
      method: "PUT",
      body: JSON.stringify({ scenarios }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(saveDealFinancialModelScenariosMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      entries: scenarios,
    });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealOutcomeForOrgMock,
  updateDealOutcomeForOrgMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealOutcomeForOrgMock: vi.fn(),
  updateDealOutcomeForOrgMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/outcomeTracking.service", () => ({
  getDealOutcomeForOrg: getDealOutcomeForOrgMock,
  updateDealOutcomeForOrg: updateDealOutcomeForOrgMock,
}));

import { GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const OUTCOME = {
  id: "77777777-7777-4777-8777-777777777777",
  dealId: DEAL_ID,
  dealName: "Demo Deal",
  actualPurchasePrice: 1200000,
  actualNoiYear1: 220000,
  actualExitPrice: 1500000,
  actualIrr: 0.12,
  actualEquityMultiple: 1.4,
  actualHoldPeriodMonths: 14,
  exitDate: "2025-11-01",
  exitType: "sale",
  killReason: null,
  killWasCorrect: false,
  notes: "validated",
  createdAt: "2025-11-02T00:00:00.000Z",
};

describe("GET /api/outcomes/[dealId]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealOutcomeForOrgMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`);
    const res = await GET(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealOutcomeForOrgMock).not.toHaveBeenCalled();
  });

  it("returns 404 when outcome not found or out of org scope", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealOutcomeForOrgMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`);
    const res = await GET(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Outcome not found" });
    expect(getDealOutcomeForOrgMock).toHaveBeenCalledWith(ORG_ID, DEAL_ID);
  });

  it("returns outcome for allowed org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealOutcomeForOrgMock.mockResolvedValue(OUTCOME);

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`);
    const res = await GET(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toEqual(OUTCOME);
    expect(getDealOutcomeForOrgMock).toHaveBeenCalledWith(ORG_ID, DEAL_ID);
  });
});

describe("PATCH /api/outcomes/[dealId]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    updateDealOutcomeForOrgMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ actualIrr: 0.19 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("rejects empty patch payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid outcome payload");
  });

  it("updates and returns the outcome", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    updateDealOutcomeForOrgMock.mockResolvedValue({
      ...OUTCOME,
      actualIrr: 0.17,
    });

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ actualIrr: 0.17 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome.actualIrr).toBe(0.17);
    expect(updateDealOutcomeForOrgMock).toHaveBeenCalledWith(
      ORG_ID,
      DEAL_ID,
      { actualIrr: 0.17 },
    );
  });

  it("returns 404 when outcome does not exist", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    updateDealOutcomeForOrgMock.mockRejectedValue(new Error("Outcome not found"));

    const req = new NextRequest(`http://localhost/api/outcomes/${DEAL_ID}`, {
      method: "PATCH",
      body: JSON.stringify({ actualIrr: 0.17 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ dealId: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Outcome not found" });
  });
});

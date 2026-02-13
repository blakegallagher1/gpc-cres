import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getOutcomeSummaryMock,
  getDealOutcomeForOrgMock,
  upsertDealOutcomeForOrgMock,
  getHistoricalAccuracyMock,
  recordAssumptionActualsMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getOutcomeSummaryMock: vi.fn(),
  getDealOutcomeForOrgMock: vi.fn(),
  upsertDealOutcomeForOrgMock: vi.fn(),
  getHistoricalAccuracyMock: vi.fn(),
  recordAssumptionActualsMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/outcomeTracking.service", () => ({
  getOutcomeSummary: getOutcomeSummaryMock,
  getDealOutcomeForOrg: getDealOutcomeForOrgMock,
  upsertDealOutcomeForOrg: upsertDealOutcomeForOrgMock,
  getHistoricalAccuracy: getHistoricalAccuracyMock,
  recordAssumptionActuals: recordAssumptionActualsMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const DEAL_OUTCOME = {
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

describe("GET /api/outcomes", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getOutcomeSummaryMock.mockReset();
    getDealOutcomeForOrgMock.mockReset();
    getHistoricalAccuracyMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/outcomes?view=summary",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getOutcomeSummaryMock).not.toHaveBeenCalled();
  });

  it("returns deal outcome for view=deal with matching org scope", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealOutcomeForOrgMock.mockResolvedValue(DEAL_OUTCOME);

    const req = new NextRequest(
      `http://localhost/api/outcomes?view=deal&dealId=${DEAL_ID}`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.outcome).toEqual(DEAL_OUTCOME);
    expect(getDealOutcomeForOrgMock).toHaveBeenCalledWith(ORG_ID, DEAL_ID);
  });
});

describe("POST /api/outcomes", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    upsertDealOutcomeForOrgMock.mockReset();
    recordAssumptionActualsMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/outcomes", {
      method: "POST",
      body: JSON.stringify({
        dealId: DEAL_ID,
        actualPurchasePrice: 1000,
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("creates a deal outcome with org-verified service call", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    upsertDealOutcomeForOrgMock.mockResolvedValue(DEAL_OUTCOME);

    const req = new NextRequest("http://localhost/api/outcomes", {
      method: "POST",
      body: JSON.stringify({
        dealId: DEAL_ID,
        notes: "validated",
        actualNoiYear1: 220000,
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.outcome).toEqual(DEAL_OUTCOME);
    expect(upsertDealOutcomeForOrgMock).toHaveBeenCalledWith(
      ORG_ID,
      DEAL_ID,
      USER_ID,
      expect.objectContaining({
        actualNoiYear1: 220000,
      }),
    );
  });

  it("returns 400 when create payload is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/outcomes", {
      method: "POST",
      body: JSON.stringify({
        dealId: "not-a-uuid",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid outcome payload");
  });
});

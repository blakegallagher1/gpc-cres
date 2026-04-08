import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealRisksMock,
  createDealRiskMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listDealRisksMock: vi.fn(),
  createDealRiskMock: vi.fn(),
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
  listDealRisks: listDealRisksMock,
  createDealRisk: createDealRiskMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const RISK_RECORD = {
  id: "77777777-7777-4777-8777-777777777777",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  category: "Regulatory",
  title: "Wetland buffer shortfall",
  description: "Wetland setback may reduce usable acreage.",
  severity: "high",
  status: "open",
  owner: "underwriter",
  source: "Triage",
  score: 28,
  notes: "Auto-generated from triage output.",
  createdAt: "2026-02-17T10:00:00.000Z",
  updatedAt: "2026-02-17T10:00:00.000Z",
};

describe("GET /api/deals/[id]/risks", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealRisksMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/risks`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealRisksMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealRisksMock.mockRejectedValue(new DealAccessErrorMock(403));

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/risks`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns risks for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealRisksMock.mockResolvedValue({ risks: [{ ...RISK_RECORD }] });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/risks`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      risks: [
        {
          ...RISK_RECORD,
          score: 28,
          createdAt: "2026-02-17T10:00:00.000Z",
          updatedAt: "2026-02-17T10:00:00.000Z",
        },
      ],
    });
    expect(listDealRisksMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("POST /api/deals/[id]/risks", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createDealRiskMock.mockReset();
  });

  it("returns 400 for empty payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/risks`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid risk payload");
    expect(createDealRiskMock).not.toHaveBeenCalled();
  });

  it("creates risk for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealRiskMock.mockResolvedValue({ risk: { ...RISK_RECORD } });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/risks`, {
      method: "POST",
      body: JSON.stringify({ title: "Wetland buffer shortfall", category: "Regulatory" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.risk.title).toBe("Wetland buffer shortfall");
    expect(createDealRiskMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      payload: {
        title: "Wetland buffer shortfall",
        category: "Regulatory",
      },
    });
  });
});

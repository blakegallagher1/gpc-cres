import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  listDealStakeholdersMock,
  createDealStakeholderMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  listDealStakeholdersMock: vi.fn(),
  createDealStakeholderMock: vi.fn(),
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
  listDealStakeholders: listDealStakeholdersMock,
  createDealStakeholder: createDealStakeholderMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const STAKEHOLDER_RECORD = {
  id: "77777777-7777-4777-8777-777777777777",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  role: "SPONSOR",
  name: "Jane Seller",
  company: "Acme Holdings",
  email: "jane.seller@example.com",
  phone: "555-0100",
  equityOwnership: "24.5",
  decisionRights: ["approve_terms", "approve_financing"],
  notes: "Primary seller contact for deal.",
  createdAt: "2026-02-17T10:00:00.000Z",
  updatedAt: "2026-02-17T10:00:00.000Z",
};

describe("GET /api/deals/[id]/stakeholders", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    listDealStakeholdersMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/stakeholders`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(listDealStakeholdersMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealStakeholdersMock.mockRejectedValue(new DealAccessErrorMock(403));

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/stakeholders`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns stakeholders for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    listDealStakeholdersMock.mockResolvedValue({ stakeholders: [{ ...STAKEHOLDER_RECORD }] });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/stakeholders`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stakeholders).toEqual([{ ...STAKEHOLDER_RECORD }]);
    expect(listDealStakeholdersMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("POST /api/deals/[id]/stakeholders", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    createDealStakeholderMock.mockReset();
  });

  it("returns 400 for invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/stakeholders`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid stakeholder payload");
    expect(createDealStakeholderMock).not.toHaveBeenCalled();
  });

  it("creates stakeholder for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    createDealStakeholderMock.mockResolvedValue({ stakeholder: { ...STAKEHOLDER_RECORD } });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/stakeholders`, {
      method: "POST",
      body: JSON.stringify({
        name: "Jane Seller",
        role: "SPONSOR",
        company: "Acme Holdings",
        decisionRights: ["approve_terms", "approve_financing"],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.stakeholder).toEqual({ ...STAKEHOLDER_RECORD });
    expect(createDealStakeholderMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      payload: {
        name: "Jane Seller",
        role: "SPONSOR",
        decisionRights: ["approve_terms", "approve_financing"],
        company: "Acme Holdings",
      },
    });
  });
});

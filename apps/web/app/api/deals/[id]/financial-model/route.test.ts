import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealFinancialModelMock,
  saveDealFinancialModelMock,
  createDealFinancialModelEntityMock,
  updateDealFinancialModelEntityMock,
  deleteDealFinancialModelEntityMock,
  DealFinancialModelRouteErrorMock,
} = vi.hoisted(() => {
  class DealFinancialModelRouteErrorMock extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    resolveAuthMock: vi.fn(),
    getDealFinancialModelMock: vi.fn(),
    saveDealFinancialModelMock: vi.fn(),
    createDealFinancialModelEntityMock: vi.fn(),
    updateDealFinancialModelEntityMock: vi.fn(),
    deleteDealFinancialModelEntityMock: vi.fn(),
    DealFinancialModelRouteErrorMock,
  };
});

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getDealFinancialModel: getDealFinancialModelMock,
  saveDealFinancialModel: saveDealFinancialModelMock,
  createDealFinancialModelEntity: createDealFinancialModelEntityMock,
  updateDealFinancialModelEntity: updateDealFinancialModelEntityMock,
  deleteDealFinancialModelEntity: deleteDealFinancialModelEntityMock,
  DealFinancialModelRouteError: DealFinancialModelRouteErrorMock,
}));

import { DELETE, GET, PATCH, POST, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  resolveAuthMock.mockReset();
  resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
  getDealFinancialModelMock.mockReset();
  saveDealFinancialModelMock.mockReset();
  createDealFinancialModelEntityMock.mockReset();
  updateDealFinancialModelEntityMock.mockReset();
  deleteDealFinancialModelEntityMock.mockReset();
});

describe("GET /api/deals/[id]/financial-model", () => {
  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealFinancialModelMock).not.toHaveBeenCalled();
  });

  it("delegates GET to the package service", async () => {
    getDealFinancialModelMock.mockResolvedValue({
      deal: { id: DEAL_ID, closingDate: "2026-03-15T00:00:00.000Z" },
      tenants: [{ id: TENANT_ID, name: "Tenant A" }],
      tenantLeases: [],
      developmentBudget: null,
      capitalSources: [],
      equityWaterfalls: [],
    });

    const res = await GET(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.deal.id).toBe(DEAL_ID);
    expect(body.tenants).toHaveLength(1);
    expect(getDealFinancialModelMock).toHaveBeenCalledWith(DEAL_ID, ORG_ID);
  });
});

describe("PUT /api/deals/[id]/financial-model", () => {
  it("returns 400 on invalid payload", async () => {
    const res = await PUT(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
        method: "PUT",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid financial model payload");
    expect(saveDealFinancialModelMock).not.toHaveBeenCalled();
  });

  it("delegates PUT to the package service", async () => {
    saveDealFinancialModelMock.mockResolvedValue({ success: true });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PUT",
      body: JSON.stringify({
        assumptions: { buildableSf: 12000 },
        developmentBudget: {
          lineItems: [{ name: "Shell", category: "hard", amount: 250000 }],
          contingencies: { hardCostContingencyPct: 8 },
        },
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(saveDealFinancialModelMock).toHaveBeenCalledWith(
      DEAL_ID,
      ORG_ID,
      expect.objectContaining({
        assumptions: expect.objectContaining({ buildableSf: 12000 }),
      }),
    );
  });
});

describe("POST /api/deals/[id]/financial-model", () => {
  it("returns 400 for invalid create payload", async () => {
    const res = await POST(
      new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
        method: "POST",
        body: JSON.stringify({
          entity: "lease",
          payload: { tenantId: TENANT_ID },
        }),
      }),
      { params: Promise.resolve({ id: DEAL_ID }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid financial model create payload");
    expect(createDealFinancialModelEntityMock).not.toHaveBeenCalled();
  });

  it("delegates POST to the package service", async () => {
    createDealFinancialModelEntityMock.mockResolvedValue({
      capitalSource: { id: "capital-1", name: "LP Equity" },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "POST",
      body: JSON.stringify({
        entity: "capitalSource",
        payload: {
          name: "LP Equity",
          sourceKind: "LP_EQUITY",
          amount: 750000,
        },
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.capitalSource.id).toBe("capital-1");
    expect(createDealFinancialModelEntityMock).toHaveBeenCalledWith(
      DEAL_ID,
      ORG_ID,
      expect.objectContaining({
        entity: "capitalSource",
      }),
    );
  });
});

describe("PATCH /api/deals/[id]/financial-model", () => {
  it("delegates PATCH to the package service", async () => {
    updateDealFinancialModelEntityMock.mockResolvedValue({
      tenant: { id: TENANT_ID, name: "Tenant A Updated" },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PATCH",
      body: JSON.stringify({
        entity: "tenant",
        payload: { id: TENANT_ID, name: "Tenant A Updated" },
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenant.name).toBe("Tenant A Updated");
    expect(updateDealFinancialModelEntityMock).toHaveBeenCalledWith(
      DEAL_ID,
      ORG_ID,
      expect.objectContaining({
        entity: "tenant",
        payload: expect.objectContaining({ id: TENANT_ID }),
      }),
    );
  });
});

describe("DELETE /api/deals/[id]/financial-model", () => {
  it("delegates DELETE to the package service", async () => {
    deleteDealFinancialModelEntityMock.mockResolvedValue({ success: true });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "DELETE",
      body: JSON.stringify({
        entity: "tenant",
        payload: { id: TENANT_ID },
      }),
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(deleteDealFinancialModelEntityMock).toHaveBeenCalledWith(
      DEAL_ID,
      ORG_ID,
      expect.objectContaining({
        entity: "tenant",
        payload: { id: TENANT_ID },
      }),
    );
  });
});

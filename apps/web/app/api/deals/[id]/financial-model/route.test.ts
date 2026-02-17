import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findDealUniqueMock,
  findDealFirstMock,
  updateDealMock,
  tenantCreateMock,
  tenantFindFirstMock,
  tenantUpdateMock,
  tenantDeleteMock,
  tenantLeaseFindManyMock,
  tenantLeaseCreateMock,
  tenantLeaseFindFirstMock,
  tenantLeaseUpdateMock,
  tenantLeaseDeleteMock,
  developmentBudgetUpsertMock,
  developmentBudgetDeleteManyMock,
  transactionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findDealUniqueMock: vi.fn(),
  findDealFirstMock: vi.fn(),
  updateDealMock: vi.fn(),
  tenantCreateMock: vi.fn(),
  tenantFindFirstMock: vi.fn(),
  tenantUpdateMock: vi.fn(),
  tenantDeleteMock: vi.fn(),
  tenantLeaseFindManyMock: vi.fn(),
  tenantLeaseCreateMock: vi.fn(),
  tenantLeaseFindFirstMock: vi.fn(),
  tenantLeaseUpdateMock: vi.fn(),
  tenantLeaseDeleteMock: vi.fn(),
  developmentBudgetUpsertMock: vi.fn(),
  developmentBudgetDeleteManyMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findUnique: findDealUniqueMock,
      findFirst: findDealFirstMock,
      update: updateDealMock,
    },
    tenant: {
      create: tenantCreateMock,
      findFirst: tenantFindFirstMock,
      update: tenantUpdateMock,
      delete: tenantDeleteMock,
    },
    tenantLease: {
      findMany: tenantLeaseFindManyMock,
      create: tenantLeaseCreateMock,
      findFirst: tenantLeaseFindFirstMock,
      update: tenantLeaseUpdateMock,
      delete: tenantLeaseDeleteMock,
    },
    developmentBudget: {
      upsert: developmentBudgetUpsertMock,
      deleteMany: developmentBudgetDeleteManyMock,
    },
    $transaction: transactionMock,
  },
}));

import { GET, POST, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const TENANT_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  resolveAuthMock.mockReset();
  findDealUniqueMock.mockReset();
  findDealFirstMock.mockReset();
  updateDealMock.mockReset();
  tenantCreateMock.mockReset();
  tenantFindFirstMock.mockReset();
  tenantUpdateMock.mockReset();
  tenantDeleteMock.mockReset();
  tenantLeaseFindManyMock.mockReset();
  tenantLeaseCreateMock.mockReset();
  tenantLeaseFindFirstMock.mockReset();
  tenantLeaseUpdateMock.mockReset();
  tenantLeaseDeleteMock.mockReset();
  developmentBudgetUpsertMock.mockReset();
  developmentBudgetDeleteManyMock.mockReset();
  transactionMock.mockReset();

  transactionMock.mockImplementation(async (callback: (tx: {
    deal: { update: typeof updateDealMock };
    developmentBudget: {
      upsert: typeof developmentBudgetUpsertMock;
      deleteMany: typeof developmentBudgetDeleteManyMock;
    };
  }) => Promise<unknown>) =>
    callback({
      deal: { update: updateDealMock },
      developmentBudget: {
        upsert: developmentBudgetUpsertMock,
        deleteMany: developmentBudgetDeleteManyMock,
      },
    }),
  );
});

describe("GET /api/deals/[id]/financial-model", () => {
  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: OTHER_ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
  });

  it("returns scoped financial model payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    findDealFirstMock.mockResolvedValue({
      id: DEAL_ID,
      name: "Industrial Deal",
      sku: "SMALL_BAY_FLEX",
      status: "INTAKE",
      financialModelAssumptions: { buildableSf: 10000 },
      parcels: [{ acreage: { toString: () => "2.0" } }],
      tenants: [
        {
          id: TENANT_ID,
          dealId: DEAL_ID,
          orgId: ORG_ID,
          name: "Tenant A",
          contactName: null,
          email: null,
          phone: null,
          notes: null,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      tenantLeases: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          dealId: DEAL_ID,
          orgId: ORG_ID,
          tenantId: TENANT_ID,
          leaseName: "Suite 100",
          startDate: new Date("2026-01-01T00:00:00.000Z"),
          endDate: new Date("2028-12-31T00:00:00.000Z"),
          rentedAreaSf: { toString: () => "5000" },
          rentPerSf: { toString: () => "12" },
          annualEscalationPct: { toString: () => "3" },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          tenant: { name: "Tenant A" },
        },
      ],
      developmentBudget: {
        id: "66666666-6666-4666-8666-666666666666",
        dealId: DEAL_ID,
        orgId: ORG_ID,
        lineItems: [{ name: "Site Work", category: "hard", amount: 100000 }],
        contingencies: { hardCostContingencyPct: 10 },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenants).toHaveLength(1);
    expect(body.tenantLeases).toHaveLength(1);
    expect(body.developmentBudget.lineItems).toHaveLength(1);
  });
});

describe("PUT /api/deals/[id]/financial-model", () => {
  it("returns 400 on invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid financial model payload");
  });

  it("returns 403 for cross-org access", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: OTHER_ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PUT",
      body: JSON.stringify({ assumptions: { buildableSf: 12000 } }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe("Forbidden: deal does not belong to your org");
  });

  it("upserts development budget and assumptions", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

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
    expect(updateDealMock).toHaveBeenCalledTimes(1);
    expect(developmentBudgetUpsertMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent for repeated development budget payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

    const payload = {
      assumptions: { buildableSf: 12000 },
      developmentBudget: {
        lineItems: [{ name: "Shell", category: "hard", amount: 250000 }],
        contingencies: { hardCostContingencyPct: 8 },
      },
    };

    const req1 = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    const req2 = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });

    const res1 = await PUT(req1, { params: Promise.resolve({ id: DEAL_ID }) });
    const res2 = await PUT(req2, { params: Promise.resolve({ id: DEAL_ID }) });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(developmentBudgetUpsertMock).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/deals/[id]/financial-model", () => {
  it("creates a tenant lease with org scoped tenant", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    tenantFindFirstMock.mockResolvedValue({ id: TENANT_ID });
    tenantLeaseCreateMock.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      dealId: DEAL_ID,
      orgId: ORG_ID,
      tenantId: TENANT_ID,
      leaseName: "Suite 100",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2028-12-31T00:00:00.000Z"),
      rentedAreaSf: { toString: () => "5000" },
      rentPerSf: { toString: () => "12" },
      annualEscalationPct: { toString: () => "3" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      tenant: { name: "Tenant A" },
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "POST",
      body: JSON.stringify({
        entity: "lease",
        payload: {
          tenantId: TENANT_ID,
          leaseName: "Suite 100",
          startDate: "2026-01-01",
          endDate: "2028-12-31",
          rentedAreaSf: 5000,
          rentPerSf: 12,
          annualEscalationPct: 3,
        },
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.tenantLease.tenantId).toBe(TENANT_ID);
    expect(tenantLeaseCreateMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid tenant lease payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealUniqueMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/financial-model`, {
      method: "POST",
      body: JSON.stringify({
        entity: "lease",
        payload: {
          tenantId: TENANT_ID,
        },
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid financial model create payload");
  });
});

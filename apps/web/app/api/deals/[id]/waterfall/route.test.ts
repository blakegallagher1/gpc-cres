import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealWaterfallStructuresMock,
  saveDealWaterfallStructuresMock,
  DealAccessErrorMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealWaterfallStructuresMock: vi.fn(),
  saveDealWaterfallStructuresMock: vi.fn(),
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
  getDealWaterfallStructures: getDealWaterfallStructuresMock,
  saveDealWaterfallStructures: saveDealWaterfallStructuresMock,
  DealAccessError: DealAccessErrorMock,
}));

import { GET, PUT } from "./route";

const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("GET /api/deals/[id]/waterfall", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealWaterfallStructuresMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/waterfall`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getDealWaterfallStructuresMock).not.toHaveBeenCalled();
  });

  it("returns waterfall structures for the scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getDealWaterfallStructuresMock.mockResolvedValue([{ tier: "pref", promote: 0.2 }]);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/waterfall`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.structures).toEqual([{ tier: "pref", promote: 0.2 }]);
    expect(getDealWaterfallStructuresMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
    });
  });
});

describe("PUT /api/deals/[id]/waterfall", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    saveDealWaterfallStructuresMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/waterfall`, {
      method: "PUT",
      body: JSON.stringify({ structures: null }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid structures payload" });
    expect(saveDealWaterfallStructuresMock).not.toHaveBeenCalled();
  });

  it("saves waterfall structures through the package seam", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const structures = [{ tier: "pref", promote: 0.2 }];
    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/waterfall`, {
      method: "PUT",
      body: JSON.stringify({ structures }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(saveDealWaterfallStructuresMock).toHaveBeenCalledWith({
      dealId: DEAL_ID,
      orgId: ORG_ID,
      entries: structures,
    });
  });
});

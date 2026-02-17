import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  findDealMock,
  findEntitlementPathMock,
  upsertEntitlementPathMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  findDealMock: vi.fn(),
  findEntitlementPathMock: vi.fn(),
  upsertEntitlementPathMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findUnique: findDealMock,
    },
    entitlementPath: {
      findUnique: findEntitlementPathMock,
      upsert: upsertEntitlementPathMock,
    },
  },
}));

import { GET, PUT } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

const ENTITLEMENT_PATH_RECORD = {
  id: "66666666-6666-4666-8666-666666666666",
  orgId: ORG_ID,
  dealId: DEAL_ID,
  recommendedStrategy: "Fast Track",
  preAppMeetingDate: "2026-01-12T00:00:00.000Z",
  preAppMeetingNotes: "Pre-app meeting completed.",
  applicationType: "CPC",
  applicationSubmittedDate: "2026-01-14T00:00:00.000Z",
  applicationNumber: "APP-2026-001",
  publicNoticeDate: "2026-01-20T00:00:00.000Z",
  publicNoticePeriodDays: 30,
  hearingScheduledDate: "2026-02-05T00:00:00.000Z",
  hearingBody: "Planning Commission",
  hearingNotes: "Witness list approved.",
  decisionDate: "2026-03-01T00:00:00.000Z",
  decisionType: "Approved",
  conditions: ["Submit updated drainage plan"],
  appealDeadline: "2026-03-08T00:00:00.000Z",
  appealFiled: false,
  conditionComplianceStatus: "tracking",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("GET /api/deals/[id]/entitlement-path", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    findDealMock.mockReset();
    findEntitlementPathMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/entitlement-path`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(findDealMock).not.toHaveBeenCalled();
    expect(findEntitlementPathMock).not.toHaveBeenCalled();
  });

  it("returns 403 when requested deal belongs to another org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: OTHER_ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/entitlement-path`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden: deal does not belong to your org" });
    expect(findEntitlementPathMock).not.toHaveBeenCalled();
  });

  it("returns 400 when deal id is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest("http://localhost/api/deals/not-a-uuid/entitlement-path");
    const res = await GET(req, { params: Promise.resolve({ id: "not-a-uuid" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid deal id");
    expect(findDealMock).not.toHaveBeenCalled();
  });

  it("returns entitlement path when present", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    findEntitlementPathMock.mockResolvedValue({ ...ENTITLEMENT_PATH_RECORD });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/entitlement-path`);
    const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entitlementPath).toMatchObject({
      id: ENTITLEMENT_PATH_RECORD.id,
      recommendedStrategy: "Fast Track",
      hearingScheduledDate: ENTITLEMENT_PATH_RECORD.hearingScheduledDate,
      conditions: ENTITLEMENT_PATH_RECORD.conditions,
    });
    expect(findEntitlementPathMock).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID },
    });
  });
});

describe("PUT /api/deals/[id]/entitlement-path", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    findDealMock.mockReset();
    upsertEntitlementPathMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(
      `http://localhost/api/deals/${DEAL_ID}/entitlement-path`,
      {
        method: "PUT",
        body: JSON.stringify({ hearingScheduledDate: "2026-02-05T00:00:00.000Z" }),
      },
    );
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(upsertEntitlementPathMock).not.toHaveBeenCalled();
  });

  it("returns 400 for empty payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/entitlement-path`, {
      method: "PUT",
      body: JSON.stringify({}),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid entitlement path payload");
    expect(upsertEntitlementPathMock).not.toHaveBeenCalled();
  });

  it("upserts entitlement path for a scoped deal", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    findDealMock.mockResolvedValue({ id: DEAL_ID, orgId: ORG_ID });
    upsertEntitlementPathMock.mockResolvedValue({
      ...ENTITLEMENT_PATH_RECORD,
      hearingScheduledDate: "2026-02-06T00:00:00.000Z",
    });

    const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}/entitlement-path`, {
      method: "PUT",
      body: JSON.stringify({
        hearingScheduledDate: "2026-02-06T00:00:00.000Z",
        hearingBody: "Planning Commission",
      }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: DEAL_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.entitlementPath.hearingScheduledDate).toBe("2026-02-06T00:00:00.000Z");
    expect(upsertEntitlementPathMock).toHaveBeenCalledWith({
      where: { dealId: DEAL_ID },
      create: expect.objectContaining({
        dealId: DEAL_ID,
        orgId: ORG_ID,
        hearingScheduledDate: new Date("2026-02-06T00:00:00.000Z"),
        hearingBody: "Planning Commission",
      }),
      update: expect.objectContaining({
        hearingScheduledDate: new Date("2026-02-06T00:00:00.000Z"),
        hearingBody: "Planning Commission",
      }),
    });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getEntitlementIntelligenceKpisMock,
  recommendEntitlementStrategyMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getEntitlementIntelligenceKpisMock: vi.fn(),
  recommendEntitlementStrategyMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/entitlementIntelligence.service", () => ({
  getEntitlementGraph: vi.fn(),
  predictEntitlementStrategies: vi.fn(),
  getEntitlementFeaturePrimitives: vi.fn(),
  getEntitlementIntelligenceKpis: getEntitlementIntelligenceKpisMock,
  upsertEntitlementGraphEdge: vi.fn(),
  upsertEntitlementGraphNode: vi.fn(),
  upsertEntitlementOutcomePrecedent: vi.fn(),
}));

vi.mock("@/lib/services/entitlementStrategyAutopilot.service", () => ({
  recommendEntitlementStrategy: recommendEntitlementStrategyMock,
}));

import { GET } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JURISDICTION_ID = "22222222-2222-4222-8222-222222222222";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";

describe("GET /api/intelligence/entitlements?view=kpi", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getEntitlementIntelligenceKpisMock.mockReset();
    recommendEntitlementStrategyMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest(
      `http://localhost/api/intelligence/entitlements?view=kpi&jurisdictionId=${JURISDICTION_ID}`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(getEntitlementIntelligenceKpisMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query validation fails", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });

    const req = new NextRequest(
      "http://localhost/api/intelligence/entitlements?view=kpi&jurisdictionId=not-a-uuid",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid query parameters");
    expect(getEntitlementIntelligenceKpisMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid boolean query values", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });

    const req = new NextRequest(
      `http://localhost/api/intelligence/entitlements?view=kpi&jurisdictionId=${JURISDICTION_ID}&persistSnapshots=maybe`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid query parameters");
    expect(getEntitlementIntelligenceKpisMock).not.toHaveBeenCalled();
  });

  it("passes org-scoped, normalized params into KPI service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });
    getEntitlementIntelligenceKpisMock.mockResolvedValue({
      jurisdictionId: JURISDICTION_ID,
      sampleSize: 12,
      medianDecisionDays: 47,
      medianTimelineAbsoluteErrorDays: 9,
      approvalCalibrationGap: -0.04,
    });

    const req = new NextRequest(
      "http://localhost/api/intelligence/entitlements" +
      `?view=kpi&jurisdictionId=${JURISDICTION_ID}` +
      `&dealId=${DEAL_ID}` +
      "&sku=OUTDOOR_STORAGE" +
      "&applicationType=Conditional%20Use%20Permit" +
      "&hearingBody=Planning%20Commission" +
      "&strategyKeys=rezoning,%20conditional_use_permit,,rezoning" +
      "&lookbackMonths=24" +
      "&snapshotLookbackMonths=48" +
      "&minSampleSize=2" +
      "&recordLimit=400" +
      "&orgId=attacker-org-id",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.medianDecisionDays).toBe(47);

    expect(getEntitlementIntelligenceKpisMock).toHaveBeenCalledTimes(1);
    expect(getEntitlementIntelligenceKpisMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      jurisdictionId: JURISDICTION_ID,
      dealId: DEAL_ID,
      sku: "OUTDOOR_STORAGE",
      applicationType: "Conditional Use Permit",
      hearingBody: "Planning Commission",
      strategyKeys: ["rezoning", "conditional_use_permit", "rezoning"],
      lookbackMonths: 24,
      snapshotLookbackMonths: 48,
      minSampleSize: 2,
      recordLimit: 400,
    });
  });

  it("returns 500 when scoped KPI retrieval fails", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });
    getEntitlementIntelligenceKpisMock.mockRejectedValue(
      new Error("Jurisdiction not found or access denied"),
    );

    const req = new NextRequest(
      `http://localhost/api/intelligence/entitlements?view=kpi&jurisdictionId=${JURISDICTION_ID}`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Jurisdiction not found or access denied" });
  });
});

describe("GET /api/intelligence/entitlements?view=recommend", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    recommendEntitlementStrategyMock.mockReset();
  });

  it("returns 400 when dealId is missing", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });

    const req = new NextRequest(
      `http://localhost/api/intelligence/entitlements?view=recommend&jurisdictionId=${JURISDICTION_ID}`,
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "dealId is required for view=recommend" });
    expect(recommendEntitlementStrategyMock).not.toHaveBeenCalled();
  });

  it("passes org-scoped params into recommendation service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: ORG_ID });
    recommendEntitlementStrategyMock.mockResolvedValue({
      orgId: ORG_ID,
      dealId: DEAL_ID,
      jurisdictionId: JURISDICTION_ID,
      recommendation: {
        status: "recommended",
        reasonCode: "recommended",
      },
    });

    const req = new NextRequest(
      "http://localhost/api/intelligence/entitlements" +
      `?view=recommend&jurisdictionId=${JURISDICTION_ID}` +
      `&dealId=${DEAL_ID}` +
      "&lookbackMonths=30" +
      "&snapshotLookbackMonths=60" +
      "&recordLimit=350" +
      "&persistSnapshots=false" +
      "&orgId=attacker-org-id",
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.recommendation.status).toBe("recommended");
    expect(recommendEntitlementStrategyMock).toHaveBeenCalledTimes(1);
    expect(recommendEntitlementStrategyMock).toHaveBeenCalledWith({
      orgId: ORG_ID,
      jurisdictionId: JURISDICTION_ID,
      dealId: DEAL_ID,
      lookbackMonths: 30,
      snapshotLookbackMonths: 60,
      recordLimit: 350,
      persistSnapshots: false,
    });
  });
});

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  fetchMock,
  dispatchEventMock,
  dealFindManyMock,
  dealCreateMock,
  dealDeleteManyMock,
  dealUpdateMock,
  dealUpdateManyMock,
  parcelCreateMock,
  assetFindFirstMock,
  dealAssetCreateMock,
  dealStageHistoryCreateMock,
  sentryCaptureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
  dispatchEventMock: vi.fn().mockResolvedValue(undefined),
  dealFindManyMock: vi.fn(),
  dealCreateMock: vi.fn(),
  dealDeleteManyMock: vi.fn(),
  dealUpdateMock: vi.fn(),
  dealUpdateManyMock: vi.fn(),
  parcelCreateMock: vi.fn(),
  assetFindFirstMock: vi.fn(),
  dealAssetCreateMock: vi.fn(),
  dealStageHistoryCreateMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findMany: dealFindManyMock,
      create: dealCreateMock,
      update: dealUpdateMock,
      deleteMany: dealDeleteManyMock,
      updateMany: dealUpdateManyMock,
    },
    parcel: {
      create: parcelCreateMock,
    },
    asset: {
      findFirst: assetFindFirstMock,
    },
    dealAsset: {
      create: dealAssetCreateMock,
    },
    dealStageHistory: {
      create: dealStageHistoryCreateMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
}));

import { GET, PATCH, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEAL_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LEGACY_SKU = "SMALL_BAY_FLEX";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_LOCAL_API_URL = process.env.LOCAL_API_URL;
const ORIGINAL_LOCAL_API_KEY = process.env.LOCAL_API_KEY;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/deals route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    fetchMock.mockReset();
    dispatchEventMock.mockReset();
    dispatchEventMock.mockResolvedValue(undefined);
    dealFindManyMock.mockReset();
    dealCreateMock.mockReset();
    dealDeleteManyMock.mockReset();
    dealUpdateMock.mockReset();
    dealUpdateManyMock.mockReset();
    parcelCreateMock.mockReset();
    assetFindFirstMock.mockReset();
    dealAssetCreateMock.mockReset();
    dealStageHistoryCreateMock.mockReset();
    sentryCaptureExceptionMock.mockReset();

    vi.stubGlobal("fetch", fetchMock);

    process.env.NODE_ENV = "test";
    process.env.LOCAL_API_URL = "https://api.example.com";
    process.env.LOCAL_API_KEY = "test-gateway-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.LOCAL_API_URL = ORIGINAL_LOCAL_API_URL;
    process.env.LOCAL_API_KEY = ORIGINAL_LOCAL_API_KEY;
  });

  describe("GET", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/deals");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dealFindManyMock).not.toHaveBeenCalled();
    });

    it("proxies to the gateway when LOCAL_API_URL and LOCAL_API_KEY are set", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      fetchMock.mockResolvedValue(jsonResponse(200, { deals: [{ id: DEAL_ID_1 }] }));

      const req = new NextRequest(
        "http://localhost/api/deals?status=INTAKE&foo=bar&search=test"
      );
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deals).toEqual([{ id: DEAL_ID_1 }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/deals");
      expect(parsed.searchParams.get("org_id")).toBe(ORG_ID);
      expect(parsed.searchParams.get("status")).toBe("INTAKE");
      expect(parsed.searchParams.get("foo")).toBe("bar");
      expect(parsed.searchParams.get("search")).toBe("test");
      expect(options).toMatchObject({
        cache: "no-store",
        headers: {
          Authorization: "Bearer test-gateway-key",
        },
      });
      expect(dealFindManyMock).not.toHaveBeenCalled();
    });

    it("maps gateway 5xx failures to 503", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      fetchMock.mockResolvedValue(new Response("backend down", { status: 502 }));

      const req = new NextRequest("http://localhost/api/deals");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({ error: "Failed to fetch deals from backend" });
    });

    it("uses Prisma fallback in non-production when gateway config is missing", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      const createdAt = new Date("2026-02-01T00:00:00.000Z");
      const updatedAt = new Date("2026-02-02T00:00:00.000Z");
      dealFindManyMock.mockResolvedValue([
        {
          id: DEAL_ID_1,
          name: "Deal One",
          sku: LEGACY_SKU,
          status: "INTAKE",
          assetClass: null,
          strategy: null,
          workflowTemplateKey: null,
          currentStageKey: null,
          legacySku: null,
          legacyStatus: null,
          primaryAssetId: null,
          jurisdiction: { id: "jur-1", name: "East Baton Rouge" },
          createdAt,
          updatedAt,
          notes: null,
          runs: [{ outputJson: { tier: "T1", triageScore: 0.87 } }],
        },
      ]);

      const req = new NextRequest(
        `http://localhost/api/deals?status=INTAKE&sku=${LEGACY_SKU}&jurisdictionId=jur-1&search=oak`
      );
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deals).toEqual([
        {
          id: DEAL_ID_1,
          name: "Deal One",
          sku: LEGACY_SKU,
          status: "INTAKE",
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "ORIGINATION",
          legacySku: LEGACY_SKU,
          legacyStatus: "INTAKE",
          primaryAssetId: null,
          jurisdiction: { id: "jur-1", name: "East Baton Rouge" },
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          notes: null,
          triageTier: "T1",
          triageScore: 0.87,
        },
      ]);

      expect(dealFindManyMock).toHaveBeenCalledWith({
        where: {
          orgId: ORG_ID,
          status: "INTAKE",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          name: { contains: "oak", mode: "insensitive" },
        },
        include: {
          jurisdiction: { select: { id: true, name: true } },
          runs: {
            where: { runType: "TRIAGE" },
            orderBy: { startedAt: "desc" },
            take: 1,
            select: { outputJson: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns 503 in production when gateway config is missing", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "production";

      const req = new NextRequest("http://localhost/api/deals");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({ error: "Deals API requires LOCAL_API_URL in production" });
      expect(dealFindManyMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("degrades to an empty list when local Prisma fallback is unavailable", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";
      dealFindManyMock.mockRejectedValue(
        new Error(
          "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
        ),
      );

      const req = new NextRequest("http://localhost/api/deals");
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ deals: [], degraded: true });
      expect(sentryCaptureExceptionMock).not.toHaveBeenCalled();
    });
  });

  describe("POST", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Deal",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dealCreateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when required fields are missing", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({ name: "Missing fields" }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain(
        "name, workflowTemplateKey or legacy sku, and jurisdictionId are required",
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dealCreateMock).not.toHaveBeenCalled();
    });

    it("creates a deal through the gateway when gateway config is present", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      fetchMock.mockResolvedValue(jsonResponse(200, { deal: { id: DEAL_ID_1, name: "Deal 1" } }));

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Deal 1",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          notes: "note",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body).toEqual({ deal: { id: DEAL_ID_1, name: "Deal 1" } });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.example.com/deals");
      expect(options).toMatchObject({
        method: "POST",
        headers: {
          Authorization: "Bearer test-gateway-key",
          "Content-Type": "application/json",
          "X-Org-Id": ORG_ID,
          "X-User-Id": USER_ID,
        },
      });
      expect(dealCreateMock).not.toHaveBeenCalled();
    });

    it("falls back to Prisma create when gateway returns 5xx", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      fetchMock.mockResolvedValue(new Response("gateway down", { status: 500 }));
      dealCreateMock.mockResolvedValue({
        id: DEAL_ID_1,
        name: "Deal 1",
        currentStageKey: "ORIGINATION",
      });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Deal 1",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.deal.id).toBe(DEAL_ID_1);
      expect(body.deal.name).toBe("Deal 1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(dealCreateMock).toHaveBeenCalledTimes(1);
    });

    it("uses Prisma fallback and creates an initial parcel in non-production", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      dealCreateMock.mockResolvedValue({
        id: DEAL_ID_1,
        name: "Deal 1",
        currentStageKey: "ORIGINATION",
      });
      parcelCreateMock.mockResolvedValue({ id: "parcel-1" });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Deal 1",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          notes: "note",
          parcelAddress: "123 Main St",
          apn: "APN-1",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.deal.id).toBe(DEAL_ID_1);
      expect(body.deal.name).toBe("Deal 1");
      expect(dealCreateMock).toHaveBeenCalledWith({
        data: {
          orgId: ORG_ID,
          name: "Deal 1",
          sku: LEGACY_SKU,
          legacySku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          status: "INTAKE",
          legacyStatus: "INTAKE",
          assetClass: "INDUSTRIAL",
          assetSubtype: null,
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "ORIGINATION",
          opportunityKind: null,
          dealSourceType: null,
          primaryAssetId: null,
          marketName: null,
          investmentSummary: null,
          businessPlanSummary: null,
          notes: "note",
          targetCloseDate: null,
          createdBy: USER_ID,
        },
        include: {
          jurisdiction: { select: { id: true, name: true } },
        },
      });
      expect(parcelCreateMock).toHaveBeenCalledWith({
        data: {
          orgId: ORG_ID,
          dealId: DEAL_ID_1,
          address: "123 Main St",
          apn: "APN-1",
        },
      });
      expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
        data: {
          dealId: DEAL_ID_1,
          orgId: ORG_ID,
          fromStageKey: null,
          toStageKey: "ORIGINATION",
          changedBy: USER_ID,
          note: "Deal created.",
        },
      });
      expect(assetFindFirstMock).not.toHaveBeenCalled();
      expect(dealAssetCreateMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts generalized fields and writes legacy plus primary asset association", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      assetFindFirstMock.mockResolvedValue({ id: ASSET_ID });
      dealCreateMock.mockResolvedValue({
        id: DEAL_ID_1,
        name: "Generalized Deal",
        currentStageKey: "UNDERWRITING",
      });
      dealAssetCreateMock.mockResolvedValue({ id: "deal-asset-1" });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Generalized Deal",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          assetClass: "LAND",
          assetSubtype: "Yard",
          strategy: "VALUE_ADD_ACQUISITION",
          workflowTemplateKey: "ACQUISITION",
          currentStageKey: "UNDERWRITING",
          opportunityKind: "PROPERTY",
          dealSourceType: "BROKER",
          primaryAssetId: ASSET_ID,
          marketName: "Baton Rouge",
          investmentSummary: "Acquire and stabilize",
          businessPlanSummary: "Improve occupancy",
        }),
      });

      const res = await POST(req);

      expect(res.status).toBe(201);
      expect(assetFindFirstMock).toHaveBeenCalledWith({
        where: { id: ASSET_ID, orgId: ORG_ID },
        select: { id: true },
      });
      expect(dealCreateMock).toHaveBeenCalledWith({
        data: {
          orgId: ORG_ID,
          name: "Generalized Deal",
          sku: LEGACY_SKU,
          legacySku: LEGACY_SKU,
          jurisdictionId: "jur-1",
          status: "PREAPP",
          legacyStatus: "PREAPP",
          assetClass: "LAND",
          assetSubtype: "Yard",
          strategy: "VALUE_ADD_ACQUISITION",
          workflowTemplateKey: "ACQUISITION",
          currentStageKey: "UNDERWRITING",
          opportunityKind: "PROPERTY",
          dealSourceType: "BROKER",
          primaryAssetId: ASSET_ID,
          marketName: "Baton Rouge",
          investmentSummary: "Acquire and stabilize",
          businessPlanSummary: "Improve occupancy",
          notes: null,
          targetCloseDate: null,
          createdBy: USER_ID,
        },
        include: {
          jurisdiction: { select: { id: true, name: true } },
        },
      });
      expect(dealAssetCreateMock).toHaveBeenCalledWith({
        data: {
          orgId: ORG_ID,
          dealId: DEAL_ID_1,
          assetId: ASSET_ID,
          role: "PRIMARY",
        },
      });
      expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
        data: {
          dealId: DEAL_ID_1,
          orgId: ORG_ID,
          fromStageKey: null,
          toStageKey: "UNDERWRITING",
          changedBy: USER_ID,
          note: "Deal created.",
        },
      });
    });

    it("returns 503 in production when gateway config is missing", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "production";

      const req = new NextRequest("http://localhost/api/deals", {
        method: "POST",
        body: JSON.stringify({
          name: "Deal 1",
          sku: LEGACY_SKU,
          jurisdictionId: "jur-1",
        }),
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body).toEqual({ error: "Deals API requires LOCAL_API_URL in production" });
      expect(dealCreateMock).not.toHaveBeenCalled();
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [DEAL_ID_1] }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dealFindManyMock).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid bulk payload", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [] }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error).toContain("ids");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dealFindManyMock).not.toHaveBeenCalled();
    });

    it("proxies bulk actions to the gateway when configured", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      fetchMock.mockResolvedValue(
        jsonResponse(200, { action: "delete", updated: 1, skipped: 0, ids: [DEAL_ID_1] })
      );

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [DEAL_ID_1] }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ action: "delete", updated: 1, skipped: 0, ids: [DEAL_ID_1] });
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.example.com/deals");
      expect(options).toMatchObject({
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-gateway-key",
          "Content-Type": "application/json",
          "X-Org-Id": ORG_ID,
        },
      });
      expect(dealFindManyMock).not.toHaveBeenCalled();
    });

    it("uses Prisma fallback for delete and returns scoped counts", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      dealFindManyMock.mockResolvedValue([{ id: DEAL_ID_1, status: "INTAKE" }]);
      dealDeleteManyMock.mockResolvedValue({ count: 1 });

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [DEAL_ID_1, DEAL_ID_2] }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        action: "delete",
        updated: 1,
        skipped: 1,
        ids: [DEAL_ID_1],
      });
      expect(dealFindManyMock).toHaveBeenCalledWith({
        where: { orgId: ORG_ID, id: { in: [DEAL_ID_1, DEAL_ID_2] } },
        select: {
          id: true,
          sku: true,
          status: true,
          legacySku: true,
          legacyStatus: true,
          assetClass: true,
          strategy: true,
          workflowTemplateKey: true,
          currentStageKey: true,
        },
      });
      expect(dealDeleteManyMock).toHaveBeenCalledWith({
        where: { id: { in: [DEAL_ID_1] } },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("uses Prisma fallback for status updates and dispatches only changed states", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      dealFindManyMock.mockResolvedValue([
        {
          id: DEAL_ID_1,
          sku: LEGACY_SKU,
          status: "INTAKE",
          legacySku: LEGACY_SKU,
          legacyStatus: "INTAKE",
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "ORIGINATION",
        },
        {
          id: DEAL_ID_2,
          sku: LEGACY_SKU,
          status: "TRIAGE_DONE",
          legacySku: LEGACY_SKU,
          legacyStatus: "TRIAGE_DONE",
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "SCREENING",
        },
      ]);
      dealUpdateMock.mockResolvedValue({});

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({
          action: "update-status",
          ids: [DEAL_ID_1, DEAL_ID_2],
          status: "TRIAGE_DONE",
        }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        action: "update-status",
        status: "TRIAGE_DONE",
        updated: 2,
        skipped: 0,
        ids: [DEAL_ID_1, DEAL_ID_2],
      });
      expect(dealUpdateMock).toHaveBeenCalledTimes(2);
      expect(dealUpdateMock).toHaveBeenNthCalledWith(1, {
        where: { id: DEAL_ID_1 },
        data: {
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "SCREENING",
          sku: LEGACY_SKU,
          status: "TRIAGE_DONE",
          legacySku: LEGACY_SKU,
          legacyStatus: "TRIAGE_DONE",
        },
      });
      expect(dealUpdateMock).toHaveBeenNthCalledWith(2, {
        where: { id: DEAL_ID_2 },
        data: {
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          currentStageKey: "SCREENING",
          sku: LEGACY_SKU,
          status: "TRIAGE_DONE",
          legacySku: LEGACY_SKU,
          legacyStatus: "TRIAGE_DONE",
        },
      });
      expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
        data: {
          dealId: DEAL_ID_1,
          orgId: ORG_ID,
          fromStageKey: "ORIGINATION",
          toStageKey: "SCREENING",
          changedBy: USER_ID,
          note: "Stage updated from legacy compatibility hint.",
        },
      });
      expect(dispatchEventMock.mock.calls).toEqual([
        [
          {
            type: "deal.stageChanged",
            dealId: DEAL_ID_1,
            from: "ORIGINATION",
            to: "SCREENING",
            orgId: ORG_ID,
          },
        ],
        [
          {
            type: "deal.statusChanged",
            dealId: DEAL_ID_1,
            from: "INTAKE",
            to: "TRIAGE_DONE",
            orgId: ORG_ID,
          },
        ],
      ]);
    });

    it("returns zero updates when none of the requested deals are org-scoped", async () => {
      resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
      delete process.env.LOCAL_API_URL;
      delete process.env.LOCAL_API_KEY;
      process.env.NODE_ENV = "development";

      dealFindManyMock.mockResolvedValue([]);

      const req = new NextRequest("http://localhost/api/deals", {
        method: "PATCH",
        body: JSON.stringify({ action: "delete", ids: [DEAL_ID_1] }),
      });

      const res = await PATCH(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ action: "delete", updated: 0, skipped: 1 });
      expect(dealDeleteManyMock).not.toHaveBeenCalled();
    });
  });
});

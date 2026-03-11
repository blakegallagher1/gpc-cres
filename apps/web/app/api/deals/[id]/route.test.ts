import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  fetchMock,
  dispatchEventMock,
  sentryCaptureExceptionMock,
  sentryFlushMock,
  dealFindFirstMock,
  dealUpdateMock,
  dealDeleteMock,
  parishPackVersionFindFirstMock,
  workflowTemplateFindFirstMock,
  assetFindFirstMock,
  dealAssetDeleteManyMock,
  dealAssetUpsertMock,
  dealStageHistoryCreateMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  fetchMock: vi.fn(),
  dispatchEventMock: vi.fn().mockResolvedValue(undefined),
  sentryCaptureExceptionMock: vi.fn(),
  sentryFlushMock: vi.fn().mockResolvedValue(undefined),
  dealFindFirstMock: vi.fn(),
  dealUpdateMock: vi.fn(),
  dealDeleteMock: vi.fn(),
  parishPackVersionFindFirstMock: vi.fn(),
  workflowTemplateFindFirstMock: vi.fn(),
  assetFindFirstMock: vi.fn(),
  dealAssetDeleteManyMock: vi.fn(),
  dealAssetUpsertMock: vi.fn(),
  dealStageHistoryCreateMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
      update: dealUpdateMock,
      delete: dealDeleteMock,
    },
    parishPackVersion: {
      findFirst: parishPackVersionFindFirstMock,
    },
    workflowTemplate: {
      findFirst: workflowTemplateFindFirstMock,
    },
    asset: {
      findFirst: assetFindFirstMock,
    },
    dealAsset: {
      deleteMany: dealAssetDeleteManyMock,
      upsert: dealAssetUpsertMock,
    },
    dealStageHistory: {
      create: dealStageHistoryCreateMock,
    },
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: sentryCaptureExceptionMock,
  flush: sentryFlushMock,
}));

import { DELETE, GET, PATCH } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";
const DEAL_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const LEGACY_SKU = "SMALL_BAY_FLEX";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_LOCAL_API_URL = process.env.LOCAL_API_URL;
const ORIGINAL_LOCAL_API_KEY = process.env.LOCAL_API_KEY;

function buildExistingDeal(overrides: Record<string, unknown> = {}) {
  return {
    id: DEAL_ID,
    orgId: ORG_ID,
    name: "Deal One",
    sku: LEGACY_SKU,
    status: "INTAKE",
    legacySku: LEGACY_SKU,
    legacyStatus: "INTAKE",
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
    currentStageKey: "ORIGINATION",
    ...overrides,
  };
}

describe("/api/deals/[id] route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    fetchMock.mockReset();
    dispatchEventMock.mockReset();
    dispatchEventMock.mockResolvedValue(undefined);
    sentryCaptureExceptionMock.mockReset();
    sentryFlushMock.mockReset();
    sentryFlushMock.mockResolvedValue(undefined);
    dealFindFirstMock.mockReset();
    dealUpdateMock.mockReset();
    dealDeleteMock.mockReset();
    parishPackVersionFindFirstMock.mockReset();
    workflowTemplateFindFirstMock.mockReset();
    assetFindFirstMock.mockReset();
    dealAssetDeleteManyMock.mockReset();
    dealAssetUpsertMock.mockReset();
    dealStageHistoryCreateMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);

    process.env.NODE_ENV = "test";
    delete process.env.LOCAL_API_URL;
    delete process.env.LOCAL_API_KEY;
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

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(dealFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 when deal is not found for the org", async () => {
      dealFindFirstMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({ error: "Deal not found" });
      expect(parishPackVersionFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns gateway deal when LOCAL_API_URL and LOCAL_API_KEY are set", async () => {
      process.env.LOCAL_API_URL = "https://api.example.com";
      process.env.LOCAL_API_KEY = "test-gateway-key";
      fetchMock.mockResolvedValue(
        new Response(
          JSON.stringify({
            deals: [{ id: DEAL_ID, name: "Gateway Deal", status: "INTAKE" }],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deal.id).toBe(DEAL_ID);
      expect(body.deal.name).toBe("Gateway Deal");
      expect(body.deal.parcels).toEqual([]);
      expect(body.deal.packContext.hasPack).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(dealFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns scoped deal payload with pack context", async () => {
      const createdAt = new Date("2026-02-10T00:00:00.000Z");
      const updatedAt = new Date("2026-02-12T00:00:00.000Z");
      const generatedAt = new Date();

      dealFindFirstMock.mockResolvedValue({
        ...buildExistingDeal(),
        jurisdiction: {
          id: "jur-1",
          name: "East Baton Rouge",
          kind: "PARISH",
          state: "LA",
        },
        parcels: [],
        tasks: [],
        artifacts: [],
        uploads: [],
        stageHistory: [
          {
            id: "history-1",
            dealId: DEAL_ID,
            orgId: ORG_ID,
            fromStageKey: null,
            toStageKey: "ORIGINATION",
            changedBy: USER_ID,
            changedAt: new Date("2026-02-10T00:00:00.000Z"),
            note: "Deal created.",
          },
        ],
        generalizedScorecards: [
          {
            id: "score-1",
            dealId: DEAL_ID,
            orgId: ORG_ID,
            module: "market_intel",
            dimension: "rent_growth",
            score: 0.82,
            weight: 1,
            evidence: "Rents are growing.",
            scoredAt: new Date("2026-02-12T00:00:00.000Z"),
            scoredBy: USER_ID,
          },
        ],
        runs: [],
        createdAt,
        updatedAt,
      });
      workflowTemplateFindFirstMock.mockResolvedValue({
        id: "template-1",
        orgId: ORG_ID,
        key: "ENTITLEMENT_LAND",
        name: "Entitlement Land",
        description: "Legacy entitlement workflow",
        isDefault: true,
        createdAt,
        updatedAt,
        stages: [
          {
            id: "stage-1",
            orgId: ORG_ID,
            templateId: "template-1",
            key: "ORIGINATION",
            name: "Origination",
            ordinal: 1,
            description: "Source and screen parcels.",
            requiredGate: "triage_ready",
            createdAt,
          },
        ],
      });

      parishPackVersionFindFirstMock.mockResolvedValue({
        id: "pack-1",
        version: "2026.02.12",
        status: "current",
        generatedAt,
        sourceEvidenceIds: ["ev-1"],
        sourceSnapshotIds: ["snap-1"],
        sourceContentHashes: ["hash-1"],
        sourceUrls: ["https://example.com/ordinance"],
        officialOnly: true,
        packCoverageScore: 0.92,
        canonicalSchemaVersion: "v1",
        coverageSourceCount: 3,
        inputHash: "input-hash",
      });

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deal.id).toBe(DEAL_ID);
      expect(body.deal.createdAt).toBe(createdAt.toISOString());
      expect(body.deal.updatedAt).toBe(updatedAt.toISOString());
      expect(body.deal.triageTier).toBeNull();
      expect(body.deal.workflowTemplate.key).toBe("ENTITLEMENT_LAND");
      expect(body.deal.stageHistory).toHaveLength(1);
      expect(body.deal.generalizedScorecards).toHaveLength(1);
      expect(body.deal.packContext.hasPack).toBe(true);
      expect(body.deal.packContext.latestPack.id).toBe("pack-1");
      expect(body.deal.packContext.latestPack.generatedAt).toBe(generatedAt.toISOString());
      expect(body.deal.packContext.missingEvidence).toEqual([]);

      expect(parishPackVersionFindFirstMock).toHaveBeenCalledWith({
        where: {
          jurisdictionId: "jur-1",
          sku: LEGACY_SKU,
          status: "current",
        },
        orderBy: { generatedAt: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          generatedAt: true,
          sourceEvidenceIds: true,
          sourceSnapshotIds: true,
          sourceContentHashes: true,
          sourceUrls: true,
          officialOnly: true,
          packCoverageScore: true,
          canonicalSchemaVersion: true,
          coverageSourceCount: true,
          inputHash: true,
        },
      });
    });

    it("returns 500 and flushes sentry when an unexpected error occurs", async () => {
      const error = new Error("db down");
      dealFindFirstMock.mockRejectedValue(error);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`);
      const res = await GET(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "Failed to fetch deal" });
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { route: "/api/deals/[id]", method: "GET" },
        })
      );
      expect(sentryFlushMock).toHaveBeenCalledWith(5000);
    });
  });

  describe("PATCH", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(dealFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 when deal is not in auth org", async () => {
      dealFindFirstMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "New Name" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({ error: "Deal not found" });
      expect(dealUpdateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when no allowed fields are provided", async () => {
      dealFindFirstMock.mockResolvedValue(buildExistingDeal());

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ disallowed: true }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body).toEqual({ error: "No valid fields provided" });
      expect(dealUpdateMock).not.toHaveBeenCalled();
    });

    it("updates the deal and dispatches status change when status differs", async () => {
      dealFindFirstMock.mockResolvedValue({
        id: DEAL_ID,
        status: "INTAKE",
        sku: LEGACY_SKU,
        legacySku: LEGACY_SKU,
        legacyStatus: "INTAKE",
        assetClass: "INDUSTRIAL",
        strategy: "ENTITLEMENT",
        workflowTemplateKey: "ENTITLEMENT_LAND",
        currentStageKey: "ORIGINATION",
      });
      dealUpdateMock.mockResolvedValue({
        id: DEAL_ID,
        name: "Updated Deal",
        status: "TRIAGE_DONE",
      });

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "TRIAGE_DONE", name: "Updated Deal" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({
        deal: { id: DEAL_ID, name: "Updated Deal", status: "TRIAGE_DONE" },
      });
      expect(dealUpdateMock).toHaveBeenCalledWith({
        where: { id: DEAL_ID },
        data: {
          assetClass: "INDUSTRIAL",
          strategy: "ENTITLEMENT",
          workflowTemplateKey: "ENTITLEMENT_LAND",
          sku: LEGACY_SKU,
          status: "TRIAGE_DONE",
          name: "Updated Deal",
          legacySku: LEGACY_SKU,
          legacyStatus: "TRIAGE_DONE",
          currentStageKey: "SCREENING",
        },
        include: {
          jurisdiction: { select: { id: true, name: true } },
        },
      });
      expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
        data: {
          dealId: DEAL_ID,
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
            dealId: DEAL_ID,
            from: "ORIGINATION",
            to: "SCREENING",
            orgId: ORG_ID,
          },
        ],
        [
          {
            type: "deal.statusChanged",
            dealId: DEAL_ID,
            from: "INTAKE",
            to: "TRIAGE_DONE",
            orgId: ORG_ID,
          },
        ],
      ]);
    });

    it("accepts generalized fields and maintains legacy compatibility", async () => {
      dealFindFirstMock.mockResolvedValue(buildExistingDeal());
      assetFindFirstMock.mockResolvedValue({ id: ASSET_ID });
      dealUpdateMock.mockResolvedValue({
        id: DEAL_ID,
        name: "Updated Deal",
        assetClass: "LAND",
        strategy: "VALUE_ADD_ACQUISITION",
        workflowTemplateKey: "ACQUISITION",
        currentStageKey: "UNDERWRITING",
        primaryAssetId: ASSET_ID,
      });
      dealAssetDeleteManyMock.mockResolvedValue({ count: 1 });
      dealAssetUpsertMock.mockResolvedValue({ id: "deal-asset-1" });

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated Deal",
          assetClass: "LAND",
          assetSubtype: "Truck Terminal",
          strategy: "VALUE_ADD_ACQUISITION",
          workflowTemplateKey: "ACQUISITION",
          currentStageKey: "UNDERWRITING",
          opportunityKind: "PROPERTY",
          dealSourceType: "BROKER",
          primaryAssetId: ASSET_ID,
          marketName: "Baton Rouge",
          investmentSummary: "Acquire below replacement cost",
          businessPlanSummary: "Increase rents and improve tenant mix",
        }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deal.id).toBe(DEAL_ID);
      expect(assetFindFirstMock).toHaveBeenCalledWith({
        where: { id: ASSET_ID, orgId: ORG_ID },
        select: { id: true },
      });
      expect(dealUpdateMock).toHaveBeenCalledWith({
        where: { id: DEAL_ID },
        data: {
          name: "Updated Deal",
          assetClass: "LAND",
          assetSubtype: "Truck Terminal",
          strategy: "VALUE_ADD_ACQUISITION",
          workflowTemplateKey: "ACQUISITION",
          currentStageKey: "UNDERWRITING",
          opportunityKind: "PROPERTY",
          dealSourceType: "BROKER",
          primaryAssetId: ASSET_ID,
          marketName: "Baton Rouge",
          investmentSummary: "Acquire below replacement cost",
          businessPlanSummary: "Increase rents and improve tenant mix",
          sku: LEGACY_SKU,
          status: "PREAPP",
          legacySku: LEGACY_SKU,
          legacyStatus: "PREAPP",
        },
        include: {
          jurisdiction: { select: { id: true, name: true } },
        },
      });
      expect(dealAssetDeleteManyMock).toHaveBeenCalledWith({
        where: {
          orgId: ORG_ID,
          dealId: DEAL_ID,
          role: "PRIMARY",
          assetId: { not: ASSET_ID },
        },
      });
      expect(dealAssetUpsertMock).toHaveBeenCalledWith({
        where: {
          dealId_assetId: {
            dealId: DEAL_ID,
            assetId: ASSET_ID,
          },
        },
        create: {
          orgId: ORG_ID,
          dealId: DEAL_ID,
          assetId: ASSET_ID,
          role: "PRIMARY",
        },
        update: {
          role: "PRIMARY",
        },
      });
      expect(dealStageHistoryCreateMock).toHaveBeenCalledWith({
        data: {
          dealId: DEAL_ID,
          orgId: ORG_ID,
          fromStageKey: "ORIGINATION",
          toStageKey: "UNDERWRITING",
          changedBy: USER_ID,
          note: "Stage updated from workflow stage change.",
        },
      });
      expect(dispatchEventMock).toHaveBeenCalledWith({
        type: "deal.stageChanged",
        dealId: DEAL_ID,
        from: "ORIGINATION",
        to: "UNDERWRITING",
        orgId: ORG_ID,
      });
    });

    it("swallows dispatch failures without failing the request", async () => {
      dealFindFirstMock.mockResolvedValue(buildExistingDeal());
      dealUpdateMock.mockResolvedValue({
        id: DEAL_ID,
        name: "Updated Deal",
        status: "TRIAGE_DONE",
      });
      dispatchEventMock.mockRejectedValueOnce(new Error("dispatch failed"));

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "TRIAGE_DONE" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      await Promise.resolve();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.deal.id).toBe(DEAL_ID);
    });

    it("returns 500 and flushes sentry when patch throws", async () => {
      const error = new Error("update failed");
      dealFindFirstMock.mockResolvedValue(buildExistingDeal());
      dealUpdateMock.mockRejectedValue(error);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Updated Deal" }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "Failed to update deal" });
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { route: "/api/deals/[id]", method: "PATCH" },
        })
      );
      expect(sentryFlushMock).toHaveBeenCalledWith(5000);
    });
  });

  describe("DELETE", () => {
    it("returns 401 when unauthenticated", async () => {
      resolveAuthMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body).toEqual({ error: "Unauthorized" });
      expect(dealFindFirstMock).not.toHaveBeenCalled();
    });

    it("returns 404 when deal is not found", async () => {
      dealFindFirstMock.mockResolvedValue(null);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body).toEqual({ error: "Deal not found" });
      expect(dealDeleteMock).not.toHaveBeenCalled();
    });

    it("deletes a scoped deal", async () => {
      dealFindFirstMock.mockResolvedValue({ id: DEAL_ID });
      dealDeleteMock.mockResolvedValue({ id: DEAL_ID });

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true });
      expect(dealDeleteMock).toHaveBeenCalledWith({ where: { id: DEAL_ID } });
    });

    it("returns 500 and flushes sentry when delete fails", async () => {
      const error = new Error("delete failed");
      dealFindFirstMock.mockResolvedValue({ id: DEAL_ID });
      dealDeleteMock.mockRejectedValue(error);

      const req = new NextRequest(`http://localhost/api/deals/${DEAL_ID}`, {
        method: "DELETE",
      });
      const res = await DELETE(req, { params: Promise.resolve({ id: DEAL_ID }) });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body).toEqual({ error: "Failed to delete deal" });
      expect(sentryCaptureExceptionMock).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: { route: "/api/deals/[id]", method: "DELETE" },
        })
      );
      expect(sentryFlushMock).toHaveBeenCalledWith(5000);
    });
  });
});

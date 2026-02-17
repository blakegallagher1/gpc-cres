import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  serializeExtractionPayload,
  validateExtractionPayload,
} from "@/lib/validation/extractionSchemas";

const mocks = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  uploadFindFirstMock: vi.fn(),
  processUploadMock: vi.fn(),
  getExtractionsByDealMock: vi.fn(),
  getUnreviewedCountMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: mocks.resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: mocks.dealFindFirstMock },
    upload: { findFirst: mocks.uploadFindFirstMock },
  },
}));

vi.mock("@/lib/services/documentProcessing.service", () => ({
  getDocumentProcessingService: () => ({
    processUpload: mocks.processUploadMock,
    getExtractionsByDeal: mocks.getExtractionsByDealMock,
    getUnreviewedCount: mocks.getUnreviewedCountMock,
  }),
}));

import { GET, POST } from "./route";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/deals/deal-1/extractions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildGetRequest(): NextRequest {
  return new NextRequest("http://localhost/api/deals/deal-1/extractions", {
    method: "GET",
  });
}

describe("GET /api/deals/[id]/extractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    mocks.dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    mocks.getExtractionsByDealMock.mockResolvedValue([
      { id: "ext-1", reviewed: false },
      { id: "ext-2", reviewed: true },
    ]);
    mocks.getUnreviewedCountMock.mockResolvedValue(1);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.resolveAuthMock.mockResolvedValue(null);

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("enforces org-scoped deal access", async () => {
    mocks.dealFindFirstMock.mockResolvedValue(null);

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Deal not found" });
  });

  it("returns serialized extraction review summary fields for UI surfaces", async () => {
    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      totalCount: 2,
      pendingCount: 1,
      reviewedCount: 1,
      unreviewedCount: 1,
      extractionStatus: "pending_review",
    });
    expect(mocks.getExtractionsByDealMock).toHaveBeenCalledWith("deal-1", "org-1");
    expect(mocks.getUnreviewedCountMock).toHaveBeenCalledWith("deal-1", "org-1");
  });

  it("clamps pending counts when service values exceed extraction length", async () => {
    mocks.getExtractionsByDealMock.mockResolvedValue([{ id: "ext-1", reviewed: false }]);
    mocks.getUnreviewedCountMock.mockResolvedValue(9);

    const response = await GET(buildGetRequest(), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      totalCount: 1,
      pendingCount: 1,
      reviewedCount: 0,
      unreviewedCount: 1,
      extractionStatus: "pending_review",
    });
  });
});

describe("POST /api/deals/[id]/extractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    mocks.dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    mocks.uploadFindFirstMock.mockResolvedValue({
      id: "upload-1",
      dealId: "deal-1",
      orgId: "org-1",
    });
    mocks.processUploadMock.mockResolvedValue({
      created: true,
      extractionId: "ext-1",
      docType: "psa",
      extractedData: {
        purchase_price: 1000000,
      },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.resolveAuthMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ uploadId: "upload-1" }), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("enforces org-scoped deal access", async () => {
    mocks.dealFindFirstMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ uploadId: "upload-1" }), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Deal not found" });
  });

  it("fails closed on invalid request payload", async () => {
    const response = await POST(buildRequest({}), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Validation failed" });
  });

  it("returns 404 when upload does not match org/deal", async () => {
    mocks.uploadFindFirstMock.mockResolvedValue(null);

    const response = await POST(buildRequest({ uploadId: "upload-1" }), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Upload not found" });
  });

  it("returns 201 for first-time extraction", async () => {
    const response = await POST(buildRequest({ uploadId: "upload-1" }), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      idempotent: false,
      extractionId: "ext-1",
      docType: "psa",
    });
  });

  it("returns 200 with idempotent flag for existing extraction", async () => {
    mocks.processUploadMock.mockResolvedValue({
      created: false,
      extractionId: "ext-1",
      docType: "psa",
      extractedData: { purchase_price: 1000000 },
    });

    const response = await POST(buildRequest({ uploadId: "upload-1" }), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      idempotent: true,
      extractionId: "ext-1",
    });
  });
});

describe("extraction payload contracts", () => {
  it("validates PSA payload strictly", () => {
    const valid = validateExtractionPayload("psa", {
      purchase_price: 1200000,
      earnest_money: 25000,
      due_diligence_period_days: 45,
      dd_start_date: "2026-02-01",
      closing_date: "2026-03-15",
      contingencies: ["financing"],
      seller_representations: ["authority"],
      special_provisions: [],
      buyer_entity: "Buyer LLC",
      seller_entity: "Seller LLC",
    });

    expect(valid.success).toBe(true);

    const invalid = validateExtractionPayload("psa", {
      purchase_price: "1200000",
    });

    expect(invalid.success).toBe(false);
  });

  it("serializes invalid payloads to empty object", () => {
    const serialized = serializeExtractionPayload("lease", {
      tenant_name: "Tenant One",
      lease_type: "triple-net",
    });

    expect(serialized).toEqual({});
  });

  it("validates appraisal and LOI payloads strictly", () => {
    const appraisalValid = validateExtractionPayload("appraisal", {
      appraised_value: 2100000,
      effective_date: "2026-02-10",
      property_type: "Industrial",
      total_sf: 45000,
      total_acreage: 6.2,
      approach_values: {
        sales_comparison: 2050000,
        income: 2100000,
        cost: 1980000,
      },
      cap_rate: 0.0675,
      noi: 141750,
      highest_best_use: "Continued industrial use",
      appraiser: "ABC Appraisal Group",
    });
    expect(appraisalValid.success).toBe(true);

    const appraisalInvalid = validateExtractionPayload("appraisal", {
      appraised_value: "2100000",
    });
    expect(appraisalInvalid.success).toBe(false);

    const loiInvalid = validateExtractionPayload("loi", {
      purchase_price: 2000000,
      earnest_money: 50000,
      due_diligence_days: "30",
      closing_timeline: "45 days from execution",
      contingencies: ["financing"],
      buyer_entity: "Buyer LLC",
      seller_entity: "Seller LLC",
      expiration_date: "2026-02-20",
      financing_terms: "Cash at closing",
    });
    expect(loiInvalid.success).toBe(false);
  });
});

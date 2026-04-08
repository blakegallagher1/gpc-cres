import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getExtractionForDealMock: vi.fn(),
  updateExtractionForDealMock: vi.fn(),
  reviewExtractionForDealMock: vi.fn(),
  DealAccessErrorMock: class DealAccessError extends Error {
    status: number;

    constructor(status: number) {
      super(status === 404 ? "Deal not found" : "Forbidden");
      this.name = "DealAccessError";
      this.status = status;
    }
  },
  DealExtractionNotFoundErrorMock: class DealExtractionNotFoundError extends Error {
    constructor() {
      super("Extraction not found");
      this.name = "DealExtractionNotFoundError";
    }
  },
  DealExtractionValidationErrorMock: class DealExtractionValidationError extends Error {
    details?: Record<string, string[]>;

    constructor(message: string, details?: Record<string, string[]>) {
      super(message);
      this.name = "DealExtractionValidationError";
      this.details = details;
    }
  },
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: mocks.resolveAuthMock,
}));

vi.mock("@gpc/server", () => ({
  getExtractionForDeal: mocks.getExtractionForDealMock,
  updateExtractionForDeal: mocks.updateExtractionForDealMock,
  reviewExtractionForDeal: mocks.reviewExtractionForDealMock,
  DealAccessError: mocks.DealAccessErrorMock,
  DealExtractionNotFoundError: mocks.DealExtractionNotFoundErrorMock,
  DealExtractionValidationError: mocks.DealExtractionValidationErrorMock,
}));

import { GET, PATCH } from "./route";

function buildPatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/deals/deal-1/extractions/ext-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/deals/[id]/extractions/[extractionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    mocks.getExtractionForDealMock.mockResolvedValue({
      id: "ext-1",
      dealId: "deal-1",
      docType: "psa",
      extractedData: { purchase_price: 1250000 },
      confidence: 0.91,
    });
  });

  it("returns serialized extraction payload", async () => {
    const request = new NextRequest("http://localhost/api/deals/deal-1/extractions/ext-1", {
      method: "GET",
    });

    const response = await GET(request, {
      params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      extraction: {
        id: "ext-1",
        docType: "psa",
        extractedData: { purchase_price: 1250000 },
        confidence: 0.91,
      },
    });
  });

  it("enforces org-scoped access", async () => {
    mocks.getExtractionForDealMock.mockRejectedValue(
      new mocks.DealAccessErrorMock(404),
    );

    const request = new NextRequest("http://localhost/api/deals/deal-1/extractions/ext-1", {
      method: "GET",
    });

    const response = await GET(request, {
      params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Deal not found" });
  });
});

describe("PATCH /api/deals/[id]/extractions/[extractionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthMock.mockResolvedValue({ orgId: "org-1", userId: "user-1" });
    mocks.reviewExtractionForDealMock.mockResolvedValue({
      id: "ext-1",
      reviewed: true,
      docType: "psa",
      extractedData: {
        purchase_price: 1100000,
        earnest_money: 25000,
        due_diligence_period_days: 30,
        dd_start_date: "2026-01-01",
        closing_date: "2026-02-01",
        contingencies: ["inspection"],
        seller_representations: ["authority"],
        special_provisions: [],
        buyer_entity: "Buyer LLC",
        seller_entity: "Seller LLC",
      },
    });
    mocks.updateExtractionForDealMock.mockResolvedValue({
      id: "ext-1",
      dealId: "deal-1",
      docType: "psa",
      extractedData: {
        purchase_price: 1100000,
        earnest_money: 25000,
        due_diligence_period_days: 30,
        dd_start_date: "2026-01-01",
        closing_date: "2026-02-01",
        contingencies: ["inspection"],
        seller_representations: ["authority"],
        special_provisions: [],
        buyer_entity: "Buyer LLC",
        seller_entity: "Seller LLC",
      },
      confidence: 0.91,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.resolveAuthMock.mockResolvedValue(null);

    const response = await PATCH(buildPatchRequest({ reviewed: true }), {
      params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("fails closed on invalid extraction payload", async () => {
    mocks.updateExtractionForDealMock.mockRejectedValue(
      new mocks.DealExtractionValidationErrorMock("Validation failed", {
        extractedData: ["Invalid payload"],
      }),
    );

    const response = await PATCH(buildPatchRequest({
      docType: "psa",
      extractedData: {
        purchase_price: "1100000",
      },
    }), {
      params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Validation failed" });
  });

  it("returns 404 when extraction is outside org scope", async () => {
    mocks.updateExtractionForDealMock.mockRejectedValue(
      new mocks.DealExtractionNotFoundErrorMock(),
    );

    const response = await PATCH(
      buildPatchRequest({
        docType: "psa",
        extractedData: {
          purchase_price: 1100000,
          earnest_money: 25000,
          due_diligence_period_days: 30,
          dd_start_date: "2026-01-01",
          closing_date: "2026-02-01",
          contingencies: ["inspection"],
          seller_representations: ["authority"],
          special_provisions: [],
          buyer_entity: "Buyer LLC",
          seller_entity: "Seller LLC",
        },
      }),
      {
        params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Extraction not found" });
  });

  it("updates extraction with validated payload", async () => {
    const response = await PATCH(
      buildPatchRequest({
        docType: "psa",
        extractedData: {
          purchase_price: 1100000,
          earnest_money: 25000,
          due_diligence_period_days: 30,
          dd_start_date: "2026-01-01",
          closing_date: "2026-02-01",
          contingencies: ["inspection"],
          seller_representations: ["authority"],
          special_provisions: [],
          buyer_entity: "Buyer LLC",
          seller_entity: "Seller LLC",
        },
      }),
      {
        params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      extraction: {
        id: "ext-1",
        docType: "psa",
      },
    });
    expect(mocks.updateExtractionForDealMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: "ext-1",
        orgId: "org-1",
        dealId: "deal-1",
        docType: "psa",
      }),
    );
  });

  it("marks extraction reviewed with strict payload validation", async () => {
    const response = await PATCH(
      buildPatchRequest({
        reviewed: true,
        docType: "psa",
        extractedData: {
          purchase_price: 1100000,
          earnest_money: 25000,
          due_diligence_period_days: 30,
          dd_start_date: "2026-01-01",
          closing_date: "2026-02-01",
          contingencies: ["inspection"],
          seller_representations: ["authority"],
          special_provisions: [],
          buyer_entity: "Buyer LLC",
          seller_entity: "Seller LLC",
        },
      }),
      {
        params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.reviewExtractionForDealMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionId: "ext-1",
        orgId: "org-1",
        userId: "user-1",
        dealId: "deal-1",
        docType: "psa",
      }),
    );
  });

  it("returns 400 when no updates are provided", async () => {
    const response = await PATCH(buildPatchRequest({}), {
      params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No updates provided" });
  });

  it("returns 404 when scoped update does not affect any rows", async () => {
    mocks.updateExtractionForDealMock.mockRejectedValue(
      new mocks.DealExtractionNotFoundErrorMock(),
    );

    const response = await PATCH(
      buildPatchRequest({
        docType: "psa",
        extractedData: {
          purchase_price: 1100000,
          earnest_money: 25000,
          due_diligence_period_days: 30,
          dd_start_date: "2026-01-01",
          closing_date: "2026-02-01",
          contingencies: ["inspection"],
          seller_representations: ["authority"],
          special_provisions: [],
          buyer_entity: "Buyer LLC",
          seller_entity: "Seller LLC",
        },
      }),
      {
        params: Promise.resolve({ id: "deal-1", extractionId: "ext-1" }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Extraction not found" });
  });
});

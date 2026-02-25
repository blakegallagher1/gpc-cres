import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  documentExtractionFindManyMock,
  dealTermsFindFirstMock,
  dealFinancingFindFirstMock,
} = vi.hoisted(() => ({
  documentExtractionFindManyMock: vi.fn(),
  dealTermsFindFirstMock: vi.fn(),
  dealFinancingFindFirstMock: vi.fn(),
}));

vi.mock("@openai/agents", () => ({
  tool: <T extends object>(definition: T) => definition,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    documentExtraction: {
      findMany: documentExtractionFindManyMock,
    },
    dealTerms: {
      findFirst: dealTermsFindFirstMock,
    },
    dealFinancing: {
      findFirst: dealFinancingFindFirstMock,
    },
  },
}));

import {
  compare_document_vs_deal_terms,
  get_document_extraction_summary,
  query_document_extractions,
} from "./documentTools";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const DEAL_ID = "22222222-2222-4222-8222-222222222222";

describe("document tools", () => {
  beforeEach(() => {
    documentExtractionFindManyMock.mockReset();
    dealTermsFindFirstMock.mockReset();
    dealFinancingFindFirstMock.mockReset();
  });

  it("query_document_extractions returns matching extraction rows", async () => {
    documentExtractionFindManyMock.mockResolvedValue([
      {
        id: "ex-1",
        docType: "rent_roll",
        extractedData: { total_units: 12 },
        confidence: { toString: () => "0.91" },
        reviewed: true,
        reviewedBy: "qa-user",
        reviewedAt: new Date("2026-02-24T12:00:00.000Z"),
        extractedAt: new Date("2026-02-23T10:00:00.000Z"),
        uploadId: "up-1",
        upload: {
          filename: "rent-roll.pdf",
        },
      },
    ]);

    const response = await (
      query_document_extractions as unknown as {
        execute: (input: {
          deal_id: string;
          org_id: string;
          doc_type: "rent_roll" | null;
          min_confidence: number | null;
          reviewed_only: boolean | null;
        }) => Promise<string>;
      }
    ).execute({
      deal_id: DEAL_ID,
      org_id: ORG_ID,
      doc_type: "rent_roll",
      min_confidence: 0.85,
      reviewed_only: true,
    });

    expect(documentExtractionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dealId: DEAL_ID,
          orgId: ORG_ID,
          docType: "rent_roll",
          confidence: { gte: 0.85 },
          reviewed: true,
        },
      }),
    );

    const body = JSON.parse(response) as {
      count: number;
      extractions: Array<{ docType: string; confidence: number; filename: string | null }>;
    };

    expect(body.count).toBe(1);
    expect(body.extractions[0]).toMatchObject({
      docType: "rent_roll",
      confidence: 0.91,
      filename: "rent-roll.pdf",
    });
  });

  it("get_document_extraction_summary groups by doc type with confidence averages", async () => {
    documentExtractionFindManyMock.mockResolvedValue([
      {
        docType: "rent_roll",
        confidence: { toString: () => "0.9" },
        reviewed: true,
        upload: { filename: "rr-1.pdf" },
      },
      {
        docType: "rent_roll",
        confidence: { toString: () => "0.7" },
        reviewed: false,
        upload: { filename: "rr-2.pdf" },
      },
      {
        docType: "trailing_financials",
        confidence: { toString: () => "0.8" },
        reviewed: false,
        upload: { filename: "t12.pdf" },
      },
    ]);

    const response = await (
      get_document_extraction_summary as unknown as {
        execute: (input: { deal_id: string; org_id: string }) => Promise<string>;
      }
    ).execute({
      deal_id: DEAL_ID,
      org_id: ORG_ID,
    });

    const body = JSON.parse(response) as {
      totalExtractions: number;
      unreviewedCount: number;
      byDocType: Record<
        string,
        { count: number; avgConfidence: number; unreviewedCount: number; filenames: string[] }
      >;
    };

    expect(body.totalExtractions).toBe(3);
    expect(body.unreviewedCount).toBe(2);
    expect(body.byDocType.rent_roll).toMatchObject({
      count: 2,
      avgConfidence: 0.8,
      unreviewedCount: 1,
    });
    expect(body.byDocType.trailing_financials).toMatchObject({
      count: 1,
      avgConfidence: 0.8,
      unreviewedCount: 1,
    });
  });

  it("compare_document_vs_deal_terms returns pricing and financing discrepancies", async () => {
    dealTermsFindFirstMock.mockResolvedValue({
      offerPrice: 2_000_000,
    });
    dealFinancingFindFirstMock.mockResolvedValue({
      loanAmount: 1_400_000,
      interestRate: 6.25,
    });
    documentExtractionFindManyMock.mockResolvedValue([
      {
        docType: "psa",
        extractedData: {
          purchase_price: 1_850_000,
        },
      },
      {
        docType: "financing_commitment",
        extractedData: {
          loan_amount: 1_250_000,
          interest_rate: 5.5,
        },
      },
      {
        docType: "appraisal",
        extractedData: {
          appraised_value: 1_700_000,
        },
      },
    ]);

    const response = await (
      compare_document_vs_deal_terms as unknown as {
        execute: (input: { deal_id: string; org_id: string }) => Promise<string>;
      }
    ).execute({
      deal_id: DEAL_ID,
      org_id: ORG_ID,
    });

    const body = JSON.parse(response) as {
      discrepancies: Array<{ field: string; severity: "high" | "medium" | "low" }>;
      extractionCount: number;
      hasTerms: boolean;
      hasFinancing: boolean;
    };

    expect(body.extractionCount).toBe(3);
    expect(body.hasTerms).toBe(true);
    expect(body.hasFinancing).toBe(true);
    expect(body.discrepancies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "purchase_price", severity: "high" }),
        expect.objectContaining({ field: "loan_amount", severity: "high" }),
        expect.objectContaining({ field: "interest_rate", severity: "medium" }),
        expect.objectContaining({ field: "appraised_value_vs_offer", severity: "high" }),
      ]),
    );
  });
});

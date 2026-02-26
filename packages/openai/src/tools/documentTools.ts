import { prisma } from "@entitlement-os/db";
import { tool } from "@openai/agents";
import { z } from "zod";

const DOCUMENT_TYPES = [
  "psa",
  "phase_i_esa",
  "financing_commitment",
  "title_commitment",
  "survey",
  "zoning_letter",
  "appraisal",
  "lease",
  "loi",
  "rent_roll",
  "trailing_financials",
  "other",
] as const;

function decimalToNumber(value: { toString(): string } | number): number {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseFloat(value.toString());
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && "toString" in value) {
    const parsed = Number.parseFloat(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export const query_document_extractions = tool({
  name: "query_document_extractions",
  description:
    "Query structured data extracted from uploaded deal documents (PSAs, leases, appraisals, " +
    "Phase I ESAs, title commitments, surveys, zoning letters, LOIs, financing commitments, " +
    "rent rolls, trailing financials, etc.). Use this to pull extracted lease terms, purchase " +
    "prices, environmental findings, appraisal values, financing terms, or any other document " +
    "intelligence for a deal. Returns extracted JSON data, confidence score, doc type, filename, " +
    "and review status for each matching extraction.",
  parameters: z.object({
    deal_id: z.string().describe("The deal ID to query document extractions for."),
    org_id: z.string().describe("The organization ID (for multi-tenant scoping)."),
    doc_type: z
      .enum(DOCUMENT_TYPES)
      .optional().nullable()
      .describe("Filter by document type. Pass null to return all extractions for the deal."),
    min_confidence: z
      .number()
      .min(0)
      .max(1)
      .optional().nullable()
      .describe(
        "Minimum confidence threshold (0-1). Default 0 returns all. Use 0.85 for high-confidence " +
          "data and 0.5 for broader exploratory queries.",
      ),
    reviewed_only: z
      .boolean()
      .optional().nullable()
      .describe(
        "If true, only return extractions that have been human-reviewed. Default false.",
      ),
  }),
  execute: async (params) => {
    const where: {
      dealId: string;
      orgId: string;
      docType?: string;
      confidence?: { gte: number };
      reviewed?: boolean;
    } = {
      dealId: params.deal_id,
      orgId: params.org_id,
    };

    if (params.doc_type) {
      where.docType = params.doc_type;
    }
    if (params.min_confidence != null && params.min_confidence > 0) {
      where.confidence = { gte: params.min_confidence };
    }
    if (params.reviewed_only) {
      where.reviewed = true;
    }

    const extractions = await prisma.documentExtraction.findMany({
      where,
      include: {
        upload: {
          select: {
            id: true,
            filename: true,
            kind: true,
            contentType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (extractions.length === 0) {
      return JSON.stringify({
        count: 0,
        extractions: [],
        message: params.doc_type
          ? `No ${params.doc_type} extractions found for this deal.`
          : "No document extractions found for this deal.",
      });
    }

    const results = extractions.map((extraction) => ({
      id: extraction.id,
      docType: extraction.docType,
      extractedData: extraction.extractedData,
      confidence: decimalToNumber(extraction.confidence),
      reviewed: extraction.reviewed,
      reviewedBy: extraction.reviewedBy,
      reviewedAt: extraction.reviewedAt?.toISOString() ?? null,
      extractedAt: extraction.extractedAt.toISOString(),
      filename: extraction.upload?.filename ?? null,
      uploadId: extraction.uploadId,
    }));

    return JSON.stringify({
      count: results.length,
      extractions: results,
    });
  },
});

export const get_document_extraction_summary = tool({
  name: "get_document_extraction_summary",
  description:
    "Get a summary of all document extractions for a deal, grouped by document type. " +
    "Returns extraction counts per type, average confidence, and pending review counts.",
  parameters: z.object({
    deal_id: z.string().describe("The deal ID to summarize extractions for."),
    org_id: z.string().describe("The organization ID (for multi-tenant scoping)."),
  }),
  execute: async (params) => {
    const extractions = await prisma.documentExtraction.findMany({
      where: {
        dealId: params.deal_id,
        orgId: params.org_id,
      },
      select: {
        docType: true,
        confidence: true,
        reviewed: true,
        upload: {
          select: { filename: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (extractions.length === 0) {
      return JSON.stringify({
        totalExtractions: 0,
        byDocType: {},
        unreviewedCount: 0,
        message: "No document extractions found for this deal.",
      });
    }

    const byDocType: Record<
      string,
      {
        count: number;
        avgConfidence: number;
        unreviewedCount: number;
        filenames: string[];
      }
    > = {};
    let totalUnreviewed = 0;

    for (const extraction of extractions) {
      const docType = extraction.docType;
      if (!byDocType[docType]) {
        byDocType[docType] = {
          count: 0,
          avgConfidence: 0,
          unreviewedCount: 0,
          filenames: [],
        };
      }

      const group = byDocType[docType];
      group.count += 1;
      group.avgConfidence += decimalToNumber(extraction.confidence);

      if (!extraction.reviewed) {
        group.unreviewedCount += 1;
        totalUnreviewed += 1;
      }
      if (extraction.upload?.filename) {
        group.filenames.push(extraction.upload.filename);
      }
    }

    for (const docType of Object.keys(byDocType)) {
      const group = byDocType[docType];
      group.avgConfidence = Math.round((group.avgConfidence / group.count) * 1000) / 1000;
    }

    return JSON.stringify({
      totalExtractions: extractions.length,
      unreviewedCount: totalUnreviewed,
      byDocType,
    });
  },
});

export const compare_document_vs_deal_terms = tool({
  name: "compare_document_vs_deal_terms",
  description:
    "Compare extracted document data against the deal's stored terms and financial assumptions. " +
    "Identifies discrepancies between extracted PSA, financing commitment, appraisal, and deal values.",
  parameters: z.object({
    deal_id: z.string().describe("The deal ID to compare."),
    org_id: z.string().describe("The organization ID (for multi-tenant scoping)."),
  }),
  execute: async (params) => {
    const [dealTerms, financing, extractions] = await Promise.all([
      prisma.dealTerms.findFirst({
        where: {
          orgId: params.org_id,
          dealId: params.deal_id,
        },
      }),
      prisma.dealFinancing.findFirst({
        where: {
          orgId: params.org_id,
          dealId: params.deal_id,
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.documentExtraction.findMany({
        where: {
          dealId: params.deal_id,
          orgId: params.org_id,
          confidence: { gte: 0.5 },
        },
        select: {
          docType: true,
          extractedData: true,
        },
      }),
    ]);

    if (extractions.length === 0) {
      return JSON.stringify({
        discrepancies: [],
        message: "No document extractions available for comparison.",
      });
    }

    const discrepancies: Array<{
      field: string;
      documentValue: unknown;
      dealValue: unknown;
      docType: string;
      severity: "high" | "medium" | "low";
    }> = [];

    for (const extraction of extractions) {
      const data =
        typeof extraction.extractedData === "object" &&
        extraction.extractedData !== null &&
        !Array.isArray(extraction.extractedData)
          ? (extraction.extractedData as Record<string, unknown>)
          : {};

      if (extraction.docType === "psa" && dealTerms) {
        const docPrice = asNumber(data.purchase_price);
        const dealPrice = dealTerms.offerPrice ? asNumber(dealTerms.offerPrice) : null;

        if (
          docPrice !== null &&
          dealPrice !== null &&
          Math.abs(docPrice - dealPrice) > Math.max(10_000, dealPrice * 0.02)
        ) {
          discrepancies.push({
            field: "purchase_price",
            documentValue: docPrice,
            dealValue: dealPrice,
            docType: "psa",
            severity: "high",
          });
        }
      }

      if (extraction.docType === "financing_commitment" && financing) {
        const docLoan = asNumber(data.loan_amount);
        const dealLoan = financing.loanAmount ? asNumber(financing.loanAmount) : null;

        if (
          docLoan !== null &&
          dealLoan !== null &&
          Math.abs(docLoan - dealLoan) > Math.max(50_000, dealLoan * 0.05)
        ) {
          discrepancies.push({
            field: "loan_amount",
            documentValue: docLoan,
            dealValue: dealLoan,
            docType: "financing_commitment",
            severity: "high",
          });
        }

        const docRate = asNumber(data.interest_rate);
        const dealRate = financing.interestRate ? asNumber(financing.interestRate) : null;

        if (docRate !== null && dealRate !== null && Math.abs(docRate - dealRate) > 0.5) {
          discrepancies.push({
            field: "interest_rate",
            documentValue: docRate,
            dealValue: dealRate,
            docType: "financing_commitment",
            severity: "medium",
          });
        }
      }

      if (extraction.docType === "appraisal" && dealTerms) {
        const appraisedValue = asNumber(data.appraised_value);
        const dealPrice = dealTerms.offerPrice ? asNumber(dealTerms.offerPrice) : null;

        if (appraisedValue !== null && dealPrice !== null && appraisedValue < dealPrice * 0.95) {
          discrepancies.push({
            field: "appraised_value_vs_offer",
            documentValue: appraisedValue,
            dealValue: dealPrice,
            docType: "appraisal",
            severity: "high",
          });
        }
      }
    }

    return JSON.stringify({
      discrepancies,
      extractionCount: extractions.length,
      hasTerms: !!dealTerms,
      hasFinancing: !!financing,
    });
  },
});

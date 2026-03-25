import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { getNotificationService } from "./notification.service";
import { AppError } from "@/lib/errors";
import {
  DocTypeSchema,
  type DocType,
  DOC_TYPE_LABELS,
  serializeExtractionPayload,
  validateExtractionPayload,
} from "@/lib/validation/extractionSchemas";
import { logger, serializeErrorForLogs } from "@/lib/logger";

type ExtractionWithOptionalUpload = {
  id: string;
  orgId: string;
  uploadId: string;
  dealId: string;
  docType: string;
  extractedData: unknown;
  rawText: string | null;
  confidence: Prisma.Decimal | number | string;
  extractedAt: Date;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  upload?: {
    id: string;
    filename: string;
    kind: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  } | null;
};

/**
 * Serialized document extraction returned to routes and automation callers.
 */
export type DocumentExtractionResponse = {
  id: string;
  orgId: string;
  uploadId: string;
  dealId: string;
  docType: DocType;
  extractedData: Record<string, unknown>;
  rawText: string | null;
  confidence: number;
  extractedAt: Date;
  reviewed: boolean;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  upload?: {
    id: string;
    filename: string;
    kind: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  } | null;
};

/**
 * Persistence result that preserves whether a record was newly created.
 */
export type PersistDocumentExtractionResult = {
  created: boolean;
  extraction: DocumentExtractionResponse;
};

function toNumber(value: Prisma.Decimal | number | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value.toString());
}

function normalizeDocType(docType: string): DocType {
  const parsed = DocTypeSchema.safeParse(docType);
  return parsed.success ? parsed.data : "other";
}

function serializeExtraction(
  extraction: ExtractionWithOptionalUpload,
): DocumentExtractionResponse {
  const docType = normalizeDocType(extraction.docType);

  return {
    id: extraction.id,
    orgId: extraction.orgId,
    uploadId: extraction.uploadId,
    dealId: extraction.dealId,
    docType,
    extractedData: serializeExtractionPayload(docType, extraction.extractedData),
    rawText: extraction.rawText,
    confidence: toNumber(extraction.confidence),
    extractedAt: extraction.extractedAt,
    reviewed: extraction.reviewed,
    reviewedBy: extraction.reviewedBy,
    reviewedAt: extraction.reviewedAt,
    createdAt: extraction.createdAt,
    updatedAt: extraction.updatedAt,
    upload: extraction.upload ?? undefined,
  };
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (error as Error & { code?: string }).code === "P2002";
}

function hasOwnProperty(value: object, property: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, property);
}

/**
 * Looks up an existing extraction by upload and org.
 */
export async function findExistingDocumentExtraction(
  uploadId: string,
  orgId: string,
): Promise<DocumentExtractionResponse | null> {
  const existing = await prisma.documentExtraction.findFirst({
    where: { uploadId, orgId },
  });

  return existing ? serializeExtraction(existing) : null;
}

/**
 * Creates an extraction record while preserving duplicate safety.
 */
export async function createDocumentExtraction(input: {
  orgId: string;
  uploadId: string;
  dealId: string;
  docType: DocType;
  extractedData: Record<string, unknown>;
  rawText: string | null;
  confidence: number;
}): Promise<PersistDocumentExtractionResult> {
  try {
    const createdExtraction = await prisma.documentExtraction.create({
      data: {
        orgId: input.orgId,
        uploadId: input.uploadId,
        dealId: input.dealId,
        docType: input.docType,
        extractedData: input.extractedData as Prisma.InputJsonValue,
        rawText: input.rawText,
        confidence: input.confidence,
      },
    });

    return {
      created: true,
      extraction: serializeExtraction(createdExtraction),
    };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const existing = await prisma.documentExtraction.findFirst({
        where: { uploadId: input.uploadId, orgId: input.orgId },
      });
      if (existing) {
        return {
          created: false,
          extraction: serializeExtraction(existing),
        };
      }
    }

    throw error;
  }
}

/**
 * Auto-fills high-confidence fields onto existing deal records without overwriting user edits.
 */
export async function autoFillDealFields(
  dealId: string,
  orgId: string,
  docType: DocType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const ensureAutomationTask = async (
      title: string,
      description: string,
      pipelineStep: number,
      dueInDays: number,
    ): Promise<void> => {
      const existing = await prisma.task.findFirst({
        where: { orgId, dealId, title },
        select: { id: true },
      });
      if (existing) return;

      await prisma.task.create({
        data: {
          orgId,
          dealId,
          title,
          description,
          pipelineStep,
          dueAt: new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000),
        },
      });
    };

    const asNumber = (value: unknown): number | null => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Number(value.replace(/[$,%\s,]/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };

    const parcels = await prisma.parcel.findMany({
      where: { dealId },
      select: {
        id: true,
        floodZone: true,
        acreage: true,
        currentZoning: true,
        envNotes: true,
      },
    });

    if (docType === "survey") {
      for (const parcel of parcels) {
        const updates: Record<string, unknown> = {};
        if (!parcel.floodZone && data.flood_zone) updates.floodZone = String(data.flood_zone);
        if (!parcel.acreage && data.total_acreage) updates.acreage = Number(data.total_acreage);
        if (Object.keys(updates).length > 0) {
          await prisma.parcel.update({ where: { id: parcel.id }, data: updates });
        }
      }
    }

    if (docType === "zoning_letter" && data.current_zoning) {
      for (const parcel of parcels) {
        if (!parcel.currentZoning) {
          await prisma.parcel.update({
            where: { id: parcel.id },
            data: { currentZoning: String(data.current_zoning) },
          });
        }
      }
    }

    if (docType === "phase_i_esa") {
      const recs = data.recs as string[] | undefined;
      const phaseIiScope = data.phase_ii_scope;
      const consultant = data.consultant;
      const reportDate = data.report_date;
      const phaseIiRecommended = data.recommended_phase_ii;
      const deMinimis = data.de_minimis_conditions as string[] | undefined;

      const existingAssessment = await prisma.environmentalAssessment.findFirst({
        where: {
          orgId,
          dealId,
          reportType: "Phase I ESA",
          consultantName: consultant ? String(consultant) : undefined,
          phaseIiScope: phaseIiScope ? String(phaseIiScope) : undefined,
          phaseIiRecommended:
            typeof phaseIiRecommended === "boolean" ? phaseIiRecommended : undefined,
        },
        select: { id: true },
      });

      if (!existingAssessment && (recs?.length || deMinimis?.length || consultant || phaseIiScope)) {
        await prisma.environmentalAssessment.create({
          data: {
            orgId,
            dealId,
            reportType: "Phase I ESA",
            reportDate: reportDate ? new Date(String(reportDate)) : null,
            consultantName: consultant ? String(consultant) : null,
            reportTitle: "Phase I Environmental Site Assessment",
            recs: recs ?? [],
            deMinimisConditions: deMinimis ?? [],
            phaseIiRecommended: typeof phaseIiRecommended === "boolean" ? phaseIiRecommended : null,
            phaseIiScope: phaseIiScope ? String(phaseIiScope) : null,
          },
        });
      }

      if (recs && recs.length > 0) {
        await ensureAutomationTask(
          "[AUTO] Schedule Phase II ESA",
          `RECs detected in Phase I ESA. Schedule Phase II ESA scoping and proposal. RECs: ${recs.join("; ")}`,
          4,
          7,
        );

        for (const parcel of parcels) {
          if (!parcel.envNotes) {
            await prisma.parcel.update({
              where: { id: parcel.id },
              data: { envNotes: `RECs: ${recs.join("; ")}` },
            });
          }
        }
      }
    }

    if (docType === "appraisal") {
      const appraisedValue = asNumber(data.appraised_value);
      if (appraisedValue !== null) {
        const terms = await prisma.dealTerms.findFirst({
          where: { orgId, dealId },
          select: { offerPrice: true },
        });
        const offerPrice =
          terms?.offerPrice != null ? Number(terms.offerPrice.toString()) : null;
        if (offerPrice !== null && offerPrice > 0 && appraisedValue < offerPrice * 0.95) {
          const gap = Math.round(offerPrice - appraisedValue);
          await ensureAutomationTask(
            "[AUTO][HIGH] Appraisal Gap — Renegotiate",
            `Appraised value ${appraisedValue.toLocaleString()} is below offer ${offerPrice.toLocaleString()} (gap ${gap.toLocaleString()}). Review valuation gap and renegotiate terms.`,
            3,
            3,
          );
        }
      }
    }

    if (docType === "financing_commitment") {
      const extractedLoanAmount = asNumber(data.loan_amount);
      const extractedRate = asNumber(data.interest_rate);
      const extractedTerm = asNumber(data.loan_term_months);
      const extractedDscr = asNumber(data.dscr_requirement);
      const extractedLtvRaw = asNumber(data.ltv_percent);
      const extractedLtv =
        extractedLtvRaw === null ? null : extractedLtvRaw > 1 ? extractedLtvRaw / 100 : extractedLtvRaw;
      const extractedLender =
        typeof data.lender_name === "string" ? data.lender_name.trim() : null;

      const latestFinancing = await prisma.dealFinancing.findFirst({
        where: { orgId, dealId },
        orderBy: { createdAt: "desc" },
        select: {
          lenderName: true,
          loanAmount: true,
          interestRate: true,
          loanTermMonths: true,
          dscrRequirement: true,
          ltvPercent: true,
        },
      });

      if (latestFinancing) {
        const discrepancies: string[] = [];
        const modelLoanAmount =
          latestFinancing.loanAmount != null
            ? Number(latestFinancing.loanAmount.toString())
            : null;
        const modelRate =
          latestFinancing.interestRate != null
            ? Number(latestFinancing.interestRate.toString())
            : null;
        const modelDscr =
          latestFinancing.dscrRequirement != null
            ? Number(latestFinancing.dscrRequirement.toString())
            : null;
        const modelLtvRaw =
          latestFinancing.ltvPercent != null
            ? Number(latestFinancing.ltvPercent.toString())
            : null;
        const modelLtv =
          modelLtvRaw === null ? null : modelLtvRaw > 1 ? modelLtvRaw / 100 : modelLtvRaw;

        if (
          extractedLender &&
          latestFinancing.lenderName &&
          extractedLender.toLowerCase() !== latestFinancing.lenderName.toLowerCase()
        ) {
          discrepancies.push(
            `Lender mismatch: extracted "${extractedLender}" vs modeled "${latestFinancing.lenderName}"`,
          );
        }
        if (
          extractedLoanAmount !== null &&
          modelLoanAmount !== null &&
          Math.abs(extractedLoanAmount - modelLoanAmount) > Math.max(50_000, modelLoanAmount * 0.05)
        ) {
          discrepancies.push(
            `Loan amount mismatch: extracted ${Math.round(extractedLoanAmount).toLocaleString()} vs modeled ${Math.round(modelLoanAmount).toLocaleString()}`,
          );
        }
        if (
          extractedRate !== null &&
          modelRate !== null &&
          Math.abs(extractedRate - modelRate) > 0.5
        ) {
          discrepancies.push(
            `Interest rate mismatch: extracted ${extractedRate}% vs modeled ${modelRate}%`,
          );
        }
        if (
          extractedTerm !== null &&
          latestFinancing.loanTermMonths !== null &&
          Math.abs(extractedTerm - latestFinancing.loanTermMonths) > 6
        ) {
          discrepancies.push(
            `Loan term mismatch: extracted ${Math.round(extractedTerm)} months vs modeled ${latestFinancing.loanTermMonths} months`,
          );
        }
        if (
          extractedDscr !== null &&
          modelDscr !== null &&
          Math.abs(extractedDscr - modelDscr) > 0.1
        ) {
          discrepancies.push(
            `DSCR requirement mismatch: extracted ${extractedDscr} vs modeled ${modelDscr}`,
          );
        }
        if (
          extractedLtv !== null &&
          modelLtv !== null &&
          Math.abs(extractedLtv - modelLtv) > 0.03
        ) {
          discrepancies.push(
            `LTV mismatch: extracted ${(extractedLtv * 100).toFixed(1)}% vs modeled ${(modelLtv * 100).toFixed(1)}%`,
          );
        }

        if (discrepancies.length > 0) {
          await ensureAutomationTask(
            "[AUTO] Financing Commitment Discrepancy Review",
            `Extracted financing terms differ from modeled DealFinancing terms:\n- ${discrepancies.join("\n- ")}`,
            4,
            3,
          );
        }
      }
    }

    logger.info("Document processing auto-fill completed", {
      dealId,
      orgId,
      docType,
    });
  } catch (error) {
    logger.error("Document processing auto-fill failed", serializeErrorForLogs(error));
  }
}

/**
 * Creates low-confidence review notifications for all org members.
 */
export async function createReviewNotification(
  orgId: string,
  dealId: string,
  uploadId: string,
  filename: string,
  docType: DocType,
  confidence: number,
): Promise<void> {
  try {
    const notificationService = getNotificationService();
    const members = await prisma.orgMembership.findMany({
      where: { orgId },
      select: { userId: true },
    });

    const label = DOC_TYPE_LABELS[docType] || docType;
    const pct = (confidence * 100).toFixed(0);

    for (const member of members) {
      await notificationService.create({
        orgId,
        userId: member.userId,
        dealId,
        type: "AUTOMATION",
        title: `Review document extraction: "${filename}"`,
        body: `Extracted data from "${filename}" classified as ${label} with ${pct}% confidence. Please review and confirm the extracted fields.`,
        priority: confidence < 0.5 ? "MEDIUM" : "LOW",
        actionUrl: `/deals/${dealId}?tab=documents&extraction=${uploadId}`,
        sourceAgent: "document-processor",
        metadata: { uploadId, docType, confidence },
      });
    }
  } catch (error) {
    logger.error("Document processing review notification failed", serializeErrorForLogs(error));
  }
}

/**
 * Returns all extractions for a deal.
 */
export async function getDocumentExtractionsByDeal(
  dealId: string,
  orgId: string,
): Promise<DocumentExtractionResponse[]> {
  const rows = await prisma.documentExtraction.findMany({
    where: { dealId, orgId },
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

  return rows.map((row) => serializeExtraction(row));
}

/**
 * Returns a single extraction by id and org.
 */
export async function getDocumentExtraction(
  extractionId: string,
  orgId: string,
): Promise<DocumentExtractionResponse | null> {
  const row = await prisma.documentExtraction.findFirst({
    where: { id: extractionId, orgId },
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
  });

  return row ? serializeExtraction(row) : null;
}

/**
 * Reviews and optionally updates a persisted extraction.
 */
export async function reviewDocumentExtraction(
  extractionId: string,
  orgId: string,
  userId: string,
  updates?: {
    dealId?: string;
    extractedData?: Record<string, unknown>;
    docType?: DocType;
  },
): Promise<DocumentExtractionResponse> {
  const extraction = await prisma.documentExtraction.findFirst({
    where: {
      id: extractionId,
      orgId,
      ...(updates?.dealId ? { dealId: updates.dealId } : {}),
    },
  });

  if (!extraction) {
    throw new AppError("Extraction not found", "NOT_FOUND", 404);
  }

  const updateData: Prisma.DocumentExtractionUpdateInput = {
    reviewed: true,
    reviewer: { connect: { id: userId } },
    reviewedAt: new Date(),
  };

  const normalizedDocType = normalizeDocType(extraction.docType);
  const nextDocType = updates?.docType ?? normalizedDocType;
  const hasExtractedDataUpdate = Boolean(
    updates && hasOwnProperty(updates, "extractedData"),
  );
  const docTypeChanged = nextDocType !== normalizedDocType;

  if (hasExtractedDataUpdate || docTypeChanged) {
    const sourcePayload =
      hasExtractedDataUpdate && updates?.extractedData !== undefined
        ? updates.extractedData
        : extraction.extractedData;
    const validated = validateExtractionPayload(nextDocType, sourcePayload);
    if (!validated.success) {
      throw new AppError("Invalid extraction payload", "BAD_REQUEST", 400);
    }
    if (hasExtractedDataUpdate) {
      updateData.extractedData = validated.data as Prisma.InputJsonValue;
    }
  }

  if (nextDocType !== normalizedDocType) {
    updateData.docType = nextDocType;
  }

  const updated = await prisma.documentExtraction.update({
    where: { id: extractionId },
    data: updateData,
  });

  const finalData = updates?.extractedData
    ? serializeExtractionPayload(nextDocType, updates.extractedData)
    : serializeExtractionPayload(nextDocType, extraction.extractedData);
  if (Object.keys(finalData).length > 0) {
    await autoFillDealFields(extraction.dealId, extraction.orgId, nextDocType, finalData);
  }

  return serializeExtraction(updated);
}

/**
 * Returns the unreviewed extraction count for a deal.
 */
export async function getUnreviewedExtractionCount(
  dealId: string,
  orgId: string,
): Promise<number> {
  return prisma.documentExtraction.count({
    where: { dealId, orgId, reviewed: false },
  });
}

export { DOC_TYPE_LABELS };

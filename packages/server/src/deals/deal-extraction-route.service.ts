import { prisma, type Prisma } from "@entitlement-os/db";
import {
  DocTypeSchema,
  type DocType,
  validateExtractionPayload,
} from "../../../../apps/web/lib/validation/extractionSchemas";

import { getDocumentProcessingService } from "../services/document-processing.service";
import { DealAccessError } from "./deal-workspace.service";
import { DealUploadNotFoundError } from "./deal-upload.service";

type DealScope = {
  dealId: string;
  orgId: string;
};

type ExtractionScope = DealScope & {
  extractionId: string;
};

type TriggerExtractionParams = DealScope & {
  uploadId: string;
};

type UpdateExtractionParams = ExtractionScope & {
  extractedData?: unknown;
  docType?: DocType;
};

type ReviewExtractionParams = UpdateExtractionParams & {
  userId: string;
};

type ExtractionReviewStatus = "none" | "pending_review" | "review_complete";

export class DealExtractionNotFoundError extends Error {
  constructor() {
    super("Extraction not found");
    this.name = "DealExtractionNotFoundError";
  }
}

export class DealExtractionValidationError extends Error {
  details?: Record<string, string[]>;

  constructor(message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = "DealExtractionValidationError";
    this.details = details;
  }
}

function getExtractionStatus(
  totalCount: number,
  pendingCount: number,
): ExtractionReviewStatus {
  if (totalCount === 0) return "none";
  if (pendingCount > 0) return "pending_review";
  return "review_complete";
}

async function ensureDealAccess({ dealId, orgId }: DealScope): Promise<void> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { id: true },
  });

  if (!deal) {
    throw new DealAccessError(404);
  }
}

export async function getExtractionsSummaryForDeal(scope: DealScope) {
  await ensureDealAccess(scope);

  const service = getDocumentProcessingService();
  const extractions = await service.getExtractionsByDeal(scope.dealId, scope.orgId);
  const unreviewedCount = await service.getUnreviewedCount(scope.dealId, scope.orgId);
  const totalCount = extractions.length;
  const pendingCount = Math.max(0, Math.min(unreviewedCount, totalCount));
  const reviewedCount = Math.max(0, totalCount - pendingCount);

  return {
    extractions,
    unreviewedCount: pendingCount,
    pendingCount,
    reviewedCount,
    totalCount,
    extractionStatus: getExtractionStatus(totalCount, pendingCount),
  };
}

export async function triggerExtractionForDeal(
  params: TriggerExtractionParams,
) {
  await ensureDealAccess(params);

  const upload = await prisma.upload.findFirst({
    where: { id: params.uploadId, dealId: params.dealId, orgId: params.orgId },
    select: { id: true },
  });

  if (!upload) {
    throw new DealUploadNotFoundError();
  }

  const service = getDocumentProcessingService();
  const result = await service.processUpload(
    params.uploadId,
    params.dealId,
    params.orgId,
  );

  return {
    success: true,
    idempotent: !result.created,
    extractionId: result.extractionId,
    docType: result.docType,
    extractedData: result.extractedData,
    created: result.created,
  };
}

export async function getExtractionForDeal(scope: ExtractionScope) {
  await ensureDealAccess(scope);

  const service = getDocumentProcessingService();
  const extraction = await service.getExtraction(scope.extractionId, scope.orgId);

  if (!extraction || extraction.dealId !== scope.dealId) {
    throw new DealExtractionNotFoundError();
  }

  return extraction;
}

export async function reviewExtractionForDeal(
  params: ReviewExtractionParams,
) {
  await ensureDealAccess(params);

  const service = getDocumentProcessingService();
  return service.reviewExtraction(
    params.extractionId,
    params.orgId,
    params.userId,
    {
      dealId: params.dealId,
      extractedData:
        params.extractedData === undefined
          ? undefined
          : (params.extractedData as Record<string, unknown>),
      docType: params.docType,
    },
  );
}

export async function updateExtractionForDeal(
  params: UpdateExtractionParams,
) {
  await ensureDealAccess(params);

  const extraction = await prisma.documentExtraction.findFirst({
    where: {
      id: params.extractionId,
      orgId: params.orgId,
      dealId: params.dealId,
    },
  });

  if (!extraction) {
    throw new DealExtractionNotFoundError();
  }

  const docTypeResult = DocTypeSchema.safeParse(params.docType ?? extraction.docType);
  if (!docTypeResult.success) {
    throw new DealExtractionValidationError("Validation failed", {
      docType: ["Invalid document type"],
    });
  }

  const targetDocType = docTypeResult.data;
  const normalizedData =
    params.extractedData !== undefined
      ? (params.extractedData as Record<string, unknown>)
      : extraction.extractedData;
  const validated = validateExtractionPayload(targetDocType, normalizedData);

  if (!validated.success) {
    throw new DealExtractionValidationError("Validation failed", {
      extractedData: validated.issues,
    });
  }

  const updateResult = await prisma.documentExtraction.updateMany({
    where: {
      id: params.extractionId,
      orgId: params.orgId,
      dealId: params.dealId,
    },
    data: {
      ...(params.extractedData !== undefined
        ? { extractedData: validated.data as Prisma.InputJsonValue }
        : {}),
      ...(params.docType !== undefined ? { docType: targetDocType } : {}),
    },
  });

  if (updateResult.count === 0) {
    throw new DealExtractionNotFoundError();
  }

  const service = getDocumentProcessingService();
  const updated = await service.getExtraction(params.extractionId, params.orgId);

  if (!updated || updated.dealId !== params.dealId) {
    throw new DealExtractionNotFoundError();
  }

  return updated;
}

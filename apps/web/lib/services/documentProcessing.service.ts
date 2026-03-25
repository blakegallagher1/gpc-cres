import { prisma } from "@entitlement-os/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { DocType } from "@/lib/validation/extractionSchemas";
import {
  MIN_TEXT_FOR_EXTRACTION,
  classifyDocumentUpload,
  extractDocumentTextForUpload,
  extractStructuredDocumentData,
  indexDocumentInQdrant,
} from "./documentProcessingExtraction";
import {
  autoFillDealFields,
  createDocumentExtraction,
  createReviewNotification,
  DOC_TYPE_LABELS,
  findExistingDocumentExtraction,
  getDocumentExtraction,
  getDocumentExtractionsByDeal,
  getUnreviewedExtractionCount,
  type DocumentExtractionResponse,
  reviewDocumentExtraction,
} from "./documentProcessingPersistence";

export { DOC_TYPE_LABELS };

/**
 * Result returned after processing a newly uploaded document.
 */
export type ProcessUploadResult = {
  created: boolean;
  extractionId: string;
  docType: DocType;
  extractedData: Record<string, unknown>;
};

/**
 * Facade service for document extraction, review, and persistence workflows.
 */
export class DocumentProcessingService {
  /**
   * Processes an uploaded document without changing the public service contract.
   */
  async processUpload(
    uploadId: string,
    dealId: string,
    orgId: string,
  ): Promise<ProcessUploadResult> {
    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId, deal: { orgId } },
      select: {
        id: true,
        orgId: true,
        storageObjectKey: true,
        contentType: true,
        filename: true,
      },
    });

    if (!upload) {
      throw new AppError("Upload not found", "NOT_FOUND", 404);
    }

    const existing = await findExistingDocumentExtraction(uploadId, orgId);
    if (existing) {
      logger.debug("Document processing skipped existing extraction", {
        uploadId,
        extractionId: existing.id,
      });
      return {
        created: false,
        extractionId: existing.id,
        docType: existing.docType,
        extractedData: existing.extractedData,
      };
    }

    const extractedText = await extractDocumentTextForUpload(upload);
    const classification = await classifyDocumentUpload(upload.filename, extractedText);
    const extractionDocType = classification.docType === "other" ? "other" : classification.docType;

    let extractedData: Record<string, unknown> = {};
    let extractionConfidence = 0;
    let payloadValidationIssues: string[] = [];

    if (extractedText.length >= MIN_TEXT_FOR_EXTRACTION) {
      const structured = await extractStructuredDocumentData(extractedText, extractionDocType);
      if (structured.valid) {
        extractedData = structured.data;
        extractionConfidence = structured.confidence;
      } else {
        payloadValidationIssues = structured.issues;
      }
    }

    const overallConfidence =
      payloadValidationIssues.length > 0
        ? 0
        : Object.keys(extractedData).length > 0
          ? Math.min(classification.confidence, extractionConfidence)
          : classification.confidence * 0.5;

    if (payloadValidationIssues.length > 0) {
      logger.error("Document processing payload validation failed", {
        uploadId,
        docType: extractionDocType,
        issues: payloadValidationIssues,
      });
    }

    const persisted = await createDocumentExtraction({
      orgId,
      uploadId,
      dealId,
      docType: extractionDocType,
      extractedData,
      rawText: extractedText || null,
      confidence: overallConfidence,
    });

    logger.info("Document processing extraction stored", {
      uploadId,
      dealId,
      orgId,
      filename: upload.filename,
      docType: extractionDocType,
      confidence: overallConfidence,
      created: persisted.created,
    });

    if (extractedText.length >= MIN_TEXT_FOR_EXTRACTION) {
      indexDocumentInQdrant({
        orgId,
        uploadId,
        dealId,
        docType: extractionDocType,
        filename: upload.filename,
        rawText: extractedText,
      }).catch((error) => {
        logger.error("Document processing Qdrant indexing failed", {
          uploadId,
          filename: upload.filename,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (Object.keys(extractedData).length > 0) {
      if (overallConfidence >= 0.85) {
        await autoFillDealFields(dealId, orgId, extractionDocType, extractedData);
      } else {
        await createReviewNotification(
          orgId,
          dealId,
          uploadId,
          upload.filename,
          extractionDocType,
          overallConfidence,
        );
      }
    }

    return {
      created: persisted.created,
      extractionId: persisted.extraction.id,
      docType: persisted.extraction.docType,
      extractedData: persisted.extraction.extractedData,
    };
  }

  /**
   * Auto-fills deal fields from high-confidence extractions.
   */
  async autoFillDealFields(
    dealId: string,
    orgId: string,
    docType: DocType,
    data: Record<string, unknown>,
  ): Promise<void> {
    return autoFillDealFields(dealId, orgId, docType, data);
  }

  /**
   * Returns all extractions for a deal.
   */
  async getExtractionsByDeal(
    dealId: string,
    orgId: string,
  ): Promise<DocumentExtractionResponse[]> {
    return getDocumentExtractionsByDeal(dealId, orgId);
  }

  /**
   * Returns one extraction by id.
   */
  async getExtraction(
    extractionId: string,
    orgId: string,
  ): Promise<DocumentExtractionResponse | null> {
    return getDocumentExtraction(extractionId, orgId);
  }

  /**
   * Reviews and optionally updates a persisted extraction.
   */
  async reviewExtraction(
    extractionId: string,
    orgId: string,
    userId: string,
    updates?: {
      dealId?: string;
      extractedData?: Record<string, unknown>;
      docType?: DocType;
    },
  ): Promise<DocumentExtractionResponse> {
    return reviewDocumentExtraction(extractionId, orgId, userId, updates);
  }

  /**
   * Returns the unreviewed extraction count for a deal.
   */
  async getUnreviewedCount(dealId: string, orgId: string): Promise<number> {
    return getUnreviewedExtractionCount(dealId, orgId);
  }
}

let instance: DocumentProcessingService | null = null;

/**
 * Returns the document processing singleton.
 */
export function getDocumentProcessingService(): DocumentProcessingService {
  if (!instance) {
    instance = new DocumentProcessingService();
  }
  return instance;
}

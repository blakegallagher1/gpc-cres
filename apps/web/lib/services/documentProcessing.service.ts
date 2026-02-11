import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { supabaseAdmin } from "@/lib/db/supabase";
import { getNotificationService } from "./notification.service";
import { AppError } from "@/lib/errors";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Document type definitions
// ---------------------------------------------------------------------------

export type DocType =
  | "psa"
  | "phase_i_esa"
  | "title_commitment"
  | "survey"
  | "zoning_letter"
  | "appraisal"
  | "lease"
  | "loi"
  | "other";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  psa: "Purchase & Sale Agreement",
  phase_i_esa: "Phase I ESA",
  title_commitment: "Title Commitment",
  survey: "Survey",
  zoning_letter: "Zoning Letter",
  appraisal: "Appraisal",
  lease: "Lease",
  loi: "Letter of Intent",
  other: "Other",
};

// ---------------------------------------------------------------------------
// Classification — enhanced regex + LLM
// ---------------------------------------------------------------------------

const ENHANCED_CLASSIFICATION_RULES: ReadonlyArray<{
  pattern: RegExp;
  docType: DocType;
  confidence: number;
}> = [
  // PSA / Purchase Agreement
  { pattern: /purchase\s*(and|&)?\s*sale\s*agree/i, docType: "psa", confidence: 0.95 },
  { pattern: /\bpsa\b/i, docType: "psa", confidence: 0.9 },
  { pattern: /purchase\s*agreement/i, docType: "psa", confidence: 0.9 },
  { pattern: /contract\s*of\s*sale/i, docType: "psa", confidence: 0.85 },
  // Phase I ESA
  { pattern: /phase\s*[1i]\b.*(?:esa|environmental)/i, docType: "phase_i_esa", confidence: 0.95 },
  { pattern: /environmental\s*site\s*assessment/i, docType: "phase_i_esa", confidence: 0.9 },
  { pattern: /\besa\b/i, docType: "phase_i_esa", confidence: 0.7 },
  // Title Commitment
  { pattern: /title\s*commitment/i, docType: "title_commitment", confidence: 0.95 },
  { pattern: /title\s*report/i, docType: "title_commitment", confidence: 0.85 },
  { pattern: /preliminary\s*title/i, docType: "title_commitment", confidence: 0.85 },
  // Survey
  { pattern: /\bsurvey\b/i, docType: "survey", confidence: 0.85 },
  { pattern: /\balta\b/i, docType: "survey", confidence: 0.9 },
  { pattern: /\bplat\b/i, docType: "survey", confidence: 0.8 },
  { pattern: /boundary\s*(survey|map)/i, docType: "survey", confidence: 0.9 },
  // Zoning Letter
  { pattern: /zoning\s*(letter|verification|confirmation)/i, docType: "zoning_letter", confidence: 0.95 },
  { pattern: /zoning\s*compliance/i, docType: "zoning_letter", confidence: 0.85 },
  { pattern: /conditional\s*use\s*permit/i, docType: "zoning_letter", confidence: 0.8 },
  { pattern: /\bcup\b.*(?:permit|zoning)/i, docType: "zoning_letter", confidence: 0.8 },
  // Appraisal
  { pattern: /appraisal/i, docType: "appraisal", confidence: 0.9 },
  { pattern: /valuation\s*report/i, docType: "appraisal", confidence: 0.85 },
  // Lease
  { pattern: /\blease\b/i, docType: "lease", confidence: 0.85 },
  { pattern: /rent\s*roll/i, docType: "lease", confidence: 0.85 },
  { pattern: /lease\s*abstract/i, docType: "lease", confidence: 0.9 },
  // LOI
  { pattern: /letter\s*of\s*intent/i, docType: "loi", confidence: 0.9 },
  { pattern: /\bloi\b/i, docType: "loi", confidence: 0.85 },
];

function classifyByFilename(filename: string): { docType: DocType; confidence: number } {
  for (const rule of ENHANCED_CLASSIFICATION_RULES) {
    if (rule.pattern.test(filename)) {
      return { docType: rule.docType, confidence: rule.confidence };
    }
  }
  return { docType: "other", confidence: 0.3 };
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    const pdfParse = mod.default ?? mod;
    const result = await pdfParse(buffer);
    const text = String(result.text ?? "").trim();
    return text;
  } catch (err) {
    console.error("[doc-processing] PDF text extraction failed:", err);
    return "";
  }
}

function isScannedPdf(text: string, pageCount?: number): boolean {
  // Heuristic: if extracted text is very short relative to expected content,
  // it's likely a scanned PDF (image-based)
  if (!text || text.length < 50) return true;
  // If we have page count info, check chars per page
  if (pageCount && pageCount > 0) {
    const charsPerPage = text.length / pageCount;
    return charsPerPage < 100; // Less than 100 chars/page = likely scanned
  }
  return false;
}

// ---------------------------------------------------------------------------
// LLM-based classification
// ---------------------------------------------------------------------------

async function classifyWithLLM(
  text: string,
  filename: string
): Promise<{ docType: DocType; confidence: number }> {
  const openai = new OpenAI();
  const truncatedText = text.slice(0, 3000); // First 3K chars for classification

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a commercial real estate document classifier. Classify the document into exactly one type.
Return JSON with: { "doc_type": string, "confidence": number }

Valid doc_type values:
- "psa" — Purchase & Sale Agreement
- "phase_i_esa" — Phase I Environmental Site Assessment
- "title_commitment" — Title Commitment / Title Report
- "survey" — Survey / ALTA / Plat / Boundary
- "zoning_letter" — Zoning Letter / Verification / CUP
- "appraisal" — Appraisal / Valuation Report
- "lease" — Lease / Rent Roll / Lease Abstract
- "loi" — Letter of Intent
- "other" — Does not match any above

confidence: 0.0 to 1.0 (your confidence in the classification)`,
        },
        {
          role: "user",
          content: `Filename: ${filename}\n\nDocument text (first 3000 chars):\n${truncatedText}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { docType: "other", confidence: 0.3 };

    const parsed = JSON.parse(content);
    const docType = parsed.doc_type as DocType;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    // Validate doc_type
    if (docType in DOC_TYPE_LABELS) {
      return { docType, confidence: Math.min(confidence, 0.98) };
    }
    return { docType: "other", confidence: 0.3 };
  } catch (err) {
    console.error("[doc-processing] LLM classification failed:", err);
    return { docType: "other", confidence: 0.3 };
  }
}

// ---------------------------------------------------------------------------
// LLM-based structured extraction per doc type
// ---------------------------------------------------------------------------

const EXTRACTION_PROMPTS: Record<DocType, string> = {
  psa: `Extract from this Purchase & Sale Agreement:
{
  "purchase_price": number or null,
  "earnest_money": number or null,
  "due_diligence_period_days": number or null,
  "dd_start_date": "YYYY-MM-DD" or null,
  "closing_date": "YYYY-MM-DD" or null,
  "contingencies": ["string"],
  "seller_representations": ["string"],
  "special_provisions": ["string"],
  "buyer_entity": "string" or null,
  "seller_entity": "string" or null
}`,

  phase_i_esa: `Extract from this Phase I Environmental Site Assessment:
{
  "recs": ["string"],
  "de_minimis_conditions": ["string"],
  "historical_uses": ["string"],
  "adjoining_property_concerns": ["string"],
  "recommended_phase_ii": boolean,
  "phase_ii_scope": "string" or null,
  "report_date": "YYYY-MM-DD" or null,
  "consultant": "string" or null
}`,

  title_commitment: `Extract from this Title Commitment:
{
  "commitment_date": "YYYY-MM-DD" or null,
  "policy_amount": number or null,
  "requirements": ["string"],
  "exceptions": ["string"],
  "easements": ["string"],
  "liens": ["string"],
  "encumbrances": ["string"],
  "title_company": "string" or null
}`,

  survey: `Extract from this Survey:
{
  "total_acreage": number or null,
  "dimensions": "string" or null,
  "flood_zone": "string" or null,
  "flood_zone_panel": "string" or null,
  "easement_locations": ["string"],
  "utility_locations": ["string"],
  "setbacks": { "front": number or null, "side": number or null, "rear": number or null },
  "encroachments": ["string"],
  "surveyor": "string" or null,
  "survey_date": "YYYY-MM-DD" or null
}`,

  zoning_letter: `Extract from this Zoning Letter/Verification:
{
  "current_zoning": "string" or null,
  "permitted_uses": ["string"],
  "conditional_uses": ["string"],
  "dimensional_standards": {
    "max_height": number or null,
    "lot_coverage": number or null,
    "far": number or null,
    "setbacks": { "front": number or null, "side": number or null, "rear": number or null }
  },
  "variance_required": boolean,
  "overlay_districts": ["string"],
  "jurisdiction": "string" or null
}`,

  appraisal: `Extract from this Appraisal:
{
  "appraised_value": number or null,
  "effective_date": "YYYY-MM-DD" or null,
  "property_type": "string" or null,
  "total_sf": number or null,
  "total_acreage": number or null,
  "approach_values": {
    "sales_comparison": number or null,
    "income": number or null,
    "cost": number or null
  },
  "cap_rate": number or null,
  "noi": number or null,
  "highest_best_use": "string" or null,
  "appraiser": "string" or null
}`,

  lease: `Extract from this Lease:
{
  "tenant_name": "string" or null,
  "lease_type": "NNN" | "gross" | "modified_gross" | null,
  "term_years": number or null,
  "start_date": "YYYY-MM-DD" or null,
  "expiration_date": "YYYY-MM-DD" or null,
  "base_rent": number or null,
  "rent_per_sf": number or null,
  "escalation_structure": "string" or null,
  "renewal_options": ["string"],
  "tenant_improvements": "string" or null,
  "expense_stops": "string" or null,
  "security_deposit": number or null
}`,

  loi: `Extract from this Letter of Intent:
{
  "purchase_price": number or null,
  "earnest_money": number or null,
  "due_diligence_days": number or null,
  "closing_timeline": "string" or null,
  "contingencies": ["string"],
  "buyer_entity": "string" or null,
  "seller_entity": "string" or null,
  "expiration_date": "YYYY-MM-DD" or null,
  "financing_terms": "string" or null
}`,

  other: `Extract any structured information you can identify:
{
  "document_title": "string" or null,
  "document_date": "YYYY-MM-DD" or null,
  "key_parties": ["string"],
  "key_figures": [{ "label": "string", "value": "string" }],
  "summary": "string" or null
}`,
};

async function extractStructuredData(
  text: string,
  docType: DocType
): Promise<{ data: Record<string, unknown>; confidence: number }> {
  if (!text || text.length < 20) {
    return { data: {}, confidence: 0 };
  }

  const openai = new OpenAI();
  // Use up to 12K chars for extraction (fits in context window with room for response)
  const truncatedText = text.slice(0, 12000);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `You are a CRE document data extractor. Extract structured data from the document text.
Return valid JSON matching the schema below. Use null for fields you cannot find. Use empty arrays [] for list fields with no matches.
Include a top-level "extraction_confidence" field (0.0-1.0) indicating your overall confidence.

${EXTRACTION_PROMPTS[docType]}`,
        },
        {
          role: "user",
          content: truncatedText,
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { data: {}, confidence: 0 };

    const parsed = JSON.parse(content);
    const confidence =
      typeof parsed.extraction_confidence === "number"
        ? parsed.extraction_confidence
        : 0.5;

    // Remove the meta field from the extracted data
    const { extraction_confidence: _, ...data } = parsed;

    return { data, confidence: Math.min(confidence, 0.98) };
  } catch (err) {
    console.error("[doc-processing] LLM extraction failed:", err);
    return { data: {}, confidence: 0 };
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DocumentProcessingService {
  /**
   * Process a newly uploaded document:
   * 1. Download from storage
   * 2. Extract text (PDF or skip for non-PDFs)
   * 3. Classify with regex + LLM
   * 4. Extract structured data via LLM
   * 5. Store extraction results
   * 6. Auto-fill deal fields if confidence > 0.85, else create review notification
   */
  async processUpload(uploadId: string, dealId: string, orgId: string): Promise<void> {
    // Load the upload record
    const upload = await prisma.upload.findFirst({
      where: { id: uploadId, dealId, deal: { orgId } },
    });

    if (!upload) {
      console.error(`[doc-processing] Upload ${uploadId} not found`);
      return;
    }

    // Check if already extracted
    const existing = await prisma.documentExtraction.findUnique({
      where: { uploadId },
    });
    if (existing) {
      console.log(`[doc-processing] Upload ${uploadId} already extracted, skipping`);
      return;
    }

    // Only process PDFs for text extraction (skip images, spreadsheets, etc.)
    const isPdf = upload.contentType === "application/pdf" || upload.filename.toLowerCase().endsWith(".pdf");
    const isDoc = upload.contentType.includes("word") || /\.docx?$/i.test(upload.filename);

    let extractedText = "";

    if (isPdf) {
      // Download from Supabase Storage
      const { data, error } = await supabaseAdmin.storage
        .from("deal-room-uploads")
        .download(upload.storageObjectKey);

      if (error || !data) {
        console.error(`[doc-processing] Failed to download ${upload.storageObjectKey}:`, error);
        return;
      }

      const buffer = Buffer.from(await data.arrayBuffer());
      extractedText = await extractTextFromPdf(buffer);

      if (isScannedPdf(extractedText)) {
        console.log(`[doc-processing] Scanned PDF detected for "${upload.filename}" — text extraction limited`);
        // For scanned PDFs, we still proceed with whatever text we got
        // Full OCR (Tesseract.js or API) can be added as a future enhancement
      }
    } else if (isDoc) {
      // Word docs — we can't easily extract text server-side without heavy deps
      // Mark for manual review
      console.log(`[doc-processing] Word document "${upload.filename}" — text extraction not supported yet`);
    }

    // Step 1: Classify — combine regex + LLM
    const regexResult = classifyByFilename(upload.filename);
    let finalDocType = regexResult.docType;
    let classificationConfidence = regexResult.confidence;

    // If regex is uncertain or we have extracted text, use LLM
    if (extractedText.length > 50 && (regexResult.confidence < 0.85 || regexResult.docType === "other")) {
      const llmResult = await classifyWithLLM(extractedText, upload.filename);
      if (llmResult.confidence > regexResult.confidence) {
        finalDocType = llmResult.docType;
        classificationConfidence = llmResult.confidence;
      }
    }

    // Step 2: Extract structured data via LLM
    let extractedData: Record<string, unknown> = {};
    let extractionConfidence = 0;

    if (extractedText.length >= 50 && finalDocType !== "other") {
      const result = await extractStructuredData(extractedText, finalDocType);
      extractedData = result.data;
      extractionConfidence = result.confidence;
    } else if (finalDocType === "other" && extractedText.length >= 50) {
      // Even for "other" docs, try to extract something
      const result = await extractStructuredData(extractedText, "other");
      extractedData = result.data;
      extractionConfidence = result.confidence;
    }

    // Overall confidence = min of classification and extraction
    const overallConfidence =
      Object.keys(extractedData).length > 0
        ? Math.min(classificationConfidence, extractionConfidence)
        : classificationConfidence * 0.5; // Halve if no data extracted

    // Step 3: Store extraction
    await prisma.documentExtraction.create({
      data: {
        orgId,
        uploadId,
        dealId,
        docType: finalDocType,
        extractedData: extractedData as Prisma.InputJsonValue,
        rawText: extractedText || null,
        confidence: overallConfidence,
      },
    });

    console.log(
      `[doc-processing] Extracted "${upload.filename}" as ${finalDocType} (confidence: ${(overallConfidence * 100).toFixed(0)}%)`
    );

    // Step 4: Auto-fill or create review notification
    if (overallConfidence >= 0.85 && Object.keys(extractedData).length > 0) {
      await this.autoFillDealFields(dealId, finalDocType, extractedData);
    } else if (Object.keys(extractedData).length > 0) {
      // Create review notification for lower confidence extractions
      await this.createReviewNotification(
        orgId,
        dealId,
        uploadId,
        upload.filename,
        finalDocType,
        overallConfidence
      );
    }
  }

  /**
   * Auto-fill deal/parcel fields from high-confidence extractions.
   */
  private async autoFillDealFields(
    dealId: string,
    docType: DocType,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      // For certain doc types, update parcel fields
      if (docType === "survey" && data.flood_zone) {
        const parcels = await prisma.parcel.findMany({
          where: { dealId },
          select: { id: true, floodZone: true },
        });
        for (const parcel of parcels) {
          if (!parcel.floodZone) {
            await prisma.parcel.update({
              where: { id: parcel.id },
              data: { floodZone: String(data.flood_zone) },
            });
          }
        }
      }

      if (docType === "survey" && data.total_acreage) {
        const parcels = await prisma.parcel.findMany({
          where: { dealId },
          select: { id: true, acreage: true },
        });
        for (const parcel of parcels) {
          if (!parcel.acreage) {
            await prisma.parcel.update({
              where: { id: parcel.id },
              data: { acreage: Number(data.total_acreage) },
            });
          }
        }
      }

      if (docType === "zoning_letter" && data.current_zoning) {
        const parcels = await prisma.parcel.findMany({
          where: { dealId },
          select: { id: true, currentZoning: true },
        });
        for (const parcel of parcels) {
          if (!parcel.currentZoning) {
            await prisma.parcel.update({
              where: { id: parcel.id },
              data: { currentZoning: String(data.current_zoning) },
            });
          }
        }
      }

      console.log(`[doc-processing] Auto-filled deal fields from ${docType} extraction`);
    } catch (err) {
      console.error("[doc-processing] Auto-fill failed:", err);
    }
  }

  /**
   * Create a review notification for low-confidence extractions.
   */
  private async createReviewNotification(
    orgId: string,
    dealId: string,
    uploadId: string,
    filename: string,
    docType: DocType,
    confidence: number
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
    } catch (err) {
      console.error("[doc-processing] Review notification failed:", err);
    }
  }

  /**
   * Get all extractions for a deal.
   */
  async getExtractionsByDeal(dealId: string, orgId: string) {
    return prisma.documentExtraction.findMany({
      where: { dealId, orgId },
      include: {
        upload: {
          select: { id: true, filename: true, kind: true, contentType: true, sizeBytes: true, createdAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single extraction by ID.
   */
  async getExtraction(extractionId: string, orgId: string) {
    return prisma.documentExtraction.findFirst({
      where: { id: extractionId, orgId },
      include: {
        upload: {
          select: { id: true, filename: true, kind: true, contentType: true, sizeBytes: true, createdAt: true },
        },
      },
    });
  }

  /**
   * Mark extraction as reviewed, optionally update extracted data.
   */
  async reviewExtraction(
    extractionId: string,
    orgId: string,
    userId: string,
    updates?: {
      extractedData?: Record<string, unknown>;
      docType?: DocType;
    }
  ) {
    const extraction = await prisma.documentExtraction.findFirst({
      where: { id: extractionId, orgId },
    });

    if (!extraction) {
      throw new AppError("Extraction not found", "NOT_FOUND", 404);
    }

    const updateData: Prisma.DocumentExtractionUpdateInput = {
      reviewed: true,
      reviewer: { connect: { id: userId } },
      reviewedAt: new Date(),
    };

    if (updates?.extractedData) {
      updateData.extractedData = updates.extractedData as Prisma.InputJsonValue;
    }
    if (updates?.docType) {
      updateData.docType = updates.docType;
    }

    return prisma.documentExtraction.update({
      where: { id: extractionId },
      data: updateData,
    });
  }

  /**
   * Get count of unreviewed extractions for a deal.
   */
  async getUnreviewedCount(dealId: string, orgId: string): Promise<number> {
    return prisma.documentExtraction.count({
      where: { dealId, orgId, reviewed: false },
    });
  }
}

// Singleton
let _instance: DocumentProcessingService | null = null;

export function getDocumentProcessingService(): DocumentProcessingService {
  if (!_instance) _instance = new DocumentProcessingService();
  return _instance;
}

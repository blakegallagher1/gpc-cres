import { fetchObjectBytesFromGateway, systemAuth } from "@/lib/storage/gatewayStorage";
import { logger, serializeErrorForLogs } from "@/lib/logger";
import { createTextResponse } from "@entitlement-os/openai";
import {
  DOC_TYPE_LABELS,
  type DocType,
  validateExtractionPayload,
} from "@/lib/validation/extractionSchemas";

export const MIN_TEXT_FOR_EXTRACTION = 50;

type StructuredExtractionResult = {
  data: Record<string, unknown>;
  confidence: number;
  valid: boolean;
  issues: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function indexDocumentInQdrant(input: {
  orgId: string;
  uploadId: string;
  dealId: string;
  docType: string;
  filename: string;
  rawText: string;
}): Promise<void> {
  const { canUseQdrantHybridRetrieval, getAgentOsConfig, DocumentIntelligenceStore } =
    await import("@entitlement-os/openai");
  if (!canUseQdrantHybridRetrieval()) return;
  const config = getAgentOsConfig();
  if (!config.qdrant.url) return;

  const store = new DocumentIntelligenceStore(config.qdrant.url);
  await store.upsert({
    orgId: input.orgId,
    uploadId: input.uploadId,
    dealId: input.dealId,
    docType: input.docType,
    filename: input.filename,
    rawText: input.rawText,
  });
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
    return String(result.text ?? "").trim();
  } catch (error) {
    logger.error("Document processing PDF text extraction failed", serializeErrorForLogs(error));
    return "";
  }
}

function isScannedPdf(text: string, pageCount?: number): boolean {
  if (!text || text.length < MIN_TEXT_FOR_EXTRACTION) return true;
  if (!pageCount || pageCount <= 0) return false;
  return text.length / pageCount < 100;
}

async function ocrPdfBuffer(buffer: Buffer): Promise<string> {
  const tesseractModuleName = ["tesseract", "js"].join(".");
  const { createWorker } = (await import(tesseractModuleName)) as {
    createWorker: (
      language?: string,
    ) => Promise<{
      recognize: (image: Buffer | Uint8Array | string) => Promise<{ data: { text: string } }>;
      terminate: () => Promise<void>;
    }>;
  };
  const unpdf = (await import("unpdf")) as Record<string, unknown>;
  const renderPageAsImage = unpdf.renderPageAsImage as
    | ((pdf: Uint8Array, page: number, options?: { scale?: number }) => Promise<Uint8Array | null>)
    | undefined;
  const getDocumentProxy = unpdf.getDocumentProxy as
    | ((pdf: Uint8Array) => Promise<{ numPages: number }>)
    | undefined;

  if (!renderPageAsImage || !getDocumentProxy) {
    logger.warn("Document processing OCR fallback unavailable", {
      reason: "unpdf_missing_ocr_exports",
    });
    return "";
  }

  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = doc.numPages;
  if (pageCount === 0) return "";

  const worker = await createWorker("eng");
  const maxPages = Math.min(pageCount, 20);
  const pageTexts: string[] = [];

  try {
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
      try {
        const imageResult = await renderPageAsImage(new Uint8Array(buffer), pageIndex, {
          scale: 2,
        });
        if (!imageResult) continue;

        const {
          data: { text },
        } = await worker.recognize(Buffer.from(imageResult));
        if (text && text.trim().length > 0) {
          pageTexts.push(text.trim());
        }
      } catch (error) {
        logger.warn("Document processing OCR page failed", {
          pageIndex,
          ...serializeErrorForLogs(error),
        });
      }
    }
  } finally {
    await worker.terminate();
  }

  return pageTexts.join("\n\n");
}

const ENHANCED_CLASSIFICATION_RULES: ReadonlyArray<{
  pattern: RegExp;
  docType: DocType;
  confidence: number;
}> = [
  { pattern: /purchase\s*(and|&)?\s*sale\s*agree/i, docType: "psa", confidence: 0.95 },
  { pattern: /\bpsa\b/i, docType: "psa", confidence: 0.9 },
  { pattern: /purchase\s*agreement/i, docType: "psa", confidence: 0.9 },
  { pattern: /contract\s*of\s*sale/i, docType: "psa", confidence: 0.85 },
  { pattern: /phase\s*[1i]\b.*(?:esa|environmental)/i, docType: "phase_i_esa", confidence: 0.95 },
  { pattern: /environmental\s*site\s*assessment/i, docType: "phase_i_esa", confidence: 0.9 },
  { pattern: /\besa\b/i, docType: "phase_i_esa", confidence: 0.7 },
  { pattern: /financing\s*commitment/i, docType: "financing_commitment", confidence: 0.95 },
  { pattern: /loan\s*commitment/i, docType: "financing_commitment", confidence: 0.92 },
  { pattern: /commitment\s*letter/i, docType: "financing_commitment", confidence: 0.82 },
  { pattern: /title\s*commitment/i, docType: "title_commitment", confidence: 0.95 },
  { pattern: /title\s*report/i, docType: "title_commitment", confidence: 0.85 },
  { pattern: /preliminary\s*title/i, docType: "title_commitment", confidence: 0.85 },
  { pattern: /\bsurvey\b/i, docType: "survey", confidence: 0.85 },
  { pattern: /\balta\b/i, docType: "survey", confidence: 0.9 },
  { pattern: /\bplat\b/i, docType: "survey", confidence: 0.8 },
  { pattern: /boundary\s*(survey|map)/i, docType: "survey", confidence: 0.9 },
  { pattern: /zoning\s*(letter|verification|confirmation)/i, docType: "zoning_letter", confidence: 0.95 },
  { pattern: /zoning\s*compliance/i, docType: "zoning_letter", confidence: 0.85 },
  { pattern: /conditional\s*use\s*permit/i, docType: "zoning_letter", confidence: 0.8 },
  { pattern: /\bcup\b.*(?:permit|zoning)/i, docType: "zoning_letter", confidence: 0.8 },
  { pattern: /appraisal/i, docType: "appraisal", confidence: 0.9 },
  { pattern: /valuation\s*report/i, docType: "appraisal", confidence: 0.85 },
  { pattern: /\blease\b/i, docType: "lease", confidence: 0.85 },
  { pattern: /lease\s*abstract/i, docType: "lease", confidence: 0.9 },
  { pattern: /rent\s*roll/i, docType: "rent_roll", confidence: 0.95 },
  { pattern: /tenant\s*roster/i, docType: "rent_roll", confidence: 0.9 },
  { pattern: /occupancy\s*report/i, docType: "rent_roll", confidence: 0.85 },
  { pattern: /rent\s*schedule/i, docType: "rent_roll", confidence: 0.85 },
  { pattern: /trailing\s*(?:3|6|12|three|six|twelve)\s*month/i, docType: "trailing_financials", confidence: 0.95 },
  { pattern: /\b(?:t3|t6|t12)\b/i, docType: "trailing_financials", confidence: 0.9 },
  { pattern: /operating\s*statement/i, docType: "trailing_financials", confidence: 0.85 },
  { pattern: /income\s*(?:and|&)\s*expense\s*statement/i, docType: "trailing_financials", confidence: 0.85 },
  { pattern: /actual\s*(?:income|financials|operating)/i, docType: "trailing_financials", confidence: 0.8 },
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

async function classifyWithLLM(
  text: string,
  filename: string,
): Promise<{ docType: DocType; confidence: number }> {
  try {
    const { text: content } = await createTextResponse({
      model: "gpt-5.4-mini",
      temperature: 0,
      systemPrompt: `You are a commercial real estate document classifier. Classify the document into exactly one type.
Return JSON with: { "doc_type": string, "confidence": number }

Valid doc_type values:
- "psa" — Purchase & Sale Agreement
- "phase_i_esa" — Phase I Environmental Site Assessment
- "title_commitment" — Title Commitment / Title Report
- "survey" — Survey / ALTA / Plat / Boundary
- "zoning_letter" — Zoning Letter / Verification / CUP
- "appraisal" — Appraisal / Valuation Report
- "lease" — Lease / Lease Abstract
- "loi" — Letter of Intent
- "rent_roll" — Rent Roll / Tenant Roster / Occupancy Report
- "trailing_financials" — Trailing Financials / T3 / T6 / T12
- "financing_commitment" — Financing Commitment / Loan Commitment Letter
- "other" — Does not match any above

confidence: 0.0 to 1.0`,
      userPrompt: `Filename: ${filename}\n\nDocument text (first 3000 chars):\n${text.slice(0, 3000)}`,
    });

    if (!content) return { docType: "other", confidence: 0.3 };

    const parsed = JSON.parse(content) as { doc_type?: unknown; confidence?: unknown };
    const docType = typeof parsed.doc_type === "string" ? parsed.doc_type : "";
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

    if (docType in DOC_TYPE_LABELS) {
      return { docType: docType as DocType, confidence: Math.min(confidence, 0.98) };
    }

    return { docType: "other", confidence: 0.3 };
  } catch (error) {
    logger.error("Document processing LLM classification failed", serializeErrorForLogs(error));
    return { docType: "other", confidence: 0.3 };
  }
}

const EXTRACTION_PROMPTS: Record<DocType, string> = {
  psa: `Extract ALL of the following fields from this Purchase & Sale Agreement (PSA).
For dollar amounts, extract as plain numbers (no commas, no "$"). For dates use YYYY-MM-DD. For lists, include every distinct item found.

Required JSON schema:
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
  phase_i_esa: `Extract ALL of the following fields from this Phase I Environmental Site Assessment (ESA).
Required JSON schema:
{
  "recs": ["string"],
  "de_minimis_conditions": ["string"],
  "historical_uses": ["string"],
  "adjoining_property_concerns": ["string"],
  "recommended_phase_ii": true/false,
  "phase_ii_scope": "string" or null,
  "report_date": "YYYY-MM-DD" or null,
  "consultant": "string" or null
}`,
  financing_commitment: `Extract ALL of the following fields from this Financing Commitment / Loan Commitment Letter.
Required JSON schema:
{
  "lender_name": "string" or null,
  "loan_amount": number or null,
  "interest_rate": number or null,
  "loan_term_months": number or null,
  "dscr_requirement": number or null,
  "ltv_percent": number or null,
  "commitment_date": "YYYY-MM-DD" or null,
  "expiry_date": "YYYY-MM-DD" or null,
  "conditions": ["string"]
}`,
  title_commitment: `Extract ALL of the following fields from this Title Commitment / Title Report.
Required JSON schema:
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
  survey: `Extract ALL of the following fields from this Survey / ALTA / Plat / Boundary document.
Required JSON schema:
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
  zoning_letter: `Extract ALL of the following fields from this Zoning Letter / Zoning Verification / Zoning Compliance document.
Required JSON schema:
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
  "variance_required": true/false,
  "overlay_districts": ["string"],
  "jurisdiction": "string" or null
}`,
  appraisal: `Extract ALL of the following fields from this Appraisal / Valuation Report.
Required JSON schema:
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
  lease: `Extract ALL of the following fields from this Lease / Lease Abstract.
Required JSON schema:
{
  "tenant_name": "string" or null,
  "lease_type": "NNN" or "gross" or "modified_gross" or null,
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
  loi: `Extract ALL of the following fields from this Letter of Intent (LOI).
Required JSON schema:
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
  rent_roll: `Extract ALL of the following fields from this Rent Roll / Tenant Roster / Occupancy Report.
Required JSON schema:
{
  "as_of_date": "YYYY-MM-DD" or null,
  "property_name": "string" or null,
  "total_units": integer or null,
  "total_rentable_sf": number or null,
  "occupied_units": integer or null,
  "occupied_sf": number or null,
  "vacancy_rate_pct": number or null,
  "total_monthly_rent": number or null,
  "total_annual_rent": number or null,
  "avg_rent_per_sf": number or null,
  "avg_rent_per_unit": number or null,
  "tenants": [
    {
      "tenant_name": "string" or null,
      "suite_unit": "string" or null,
      "rentable_sf": number or null,
      "lease_start": "YYYY-MM-DD" or null,
      "lease_end": "YYYY-MM-DD" or null,
      "monthly_rent": number or null,
      "annual_rent": number or null,
      "rent_per_sf": number or null,
      "lease_type": "NNN" or "gross" or "modified_gross" or null,
      "status": "occupied" or "vacant" or "month_to_month" or "notice_to_vacate" or null
    }
  ],
  "weighted_avg_lease_term_years": number or null,
  "near_term_expirations": [
    {
      "tenant_name": "string" or null,
      "expiration_date": "YYYY-MM-DD" or null,
      "annual_rent": number or null,
      "sf": number or null
    }
  ]
}`,
  trailing_financials: `Extract ALL of the following fields from this Operating Statement / Trailing Financials.
Required JSON schema:
{
  "period_type": "T3" or "T6" or "T12" or null,
  "period_start": "YYYY-MM-DD" or null,
  "period_end": "YYYY-MM-DD" or null,
  "property_name": "string" or null,
  "gross_potential_rent": number or null,
  "vacancy_loss": number or null,
  "effective_gross_income": number or null,
  "other_income": number or null,
  "total_revenue": number or null,
  "real_estate_taxes": number or null,
  "insurance": number or null,
  "utilities": number or null,
  "repairs_maintenance": number or null,
  "management_fees": number or null,
  "general_administrative": number or null,
  "other_expenses": number or null,
  "total_expenses": number or null,
  "noi": number or null,
  "capex_reserves": number or null,
  "net_cash_flow": number or null,
  "expense_ratio_pct": number or null,
  "noi_margin_pct": number or null,
  "opex_per_sf": number or null,
  "annualized_noi": number or null,
  "annualized_revenue": number or null
}`,
  other: `Extract any structured information you can identify from this document:
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
  docType: DocType,
): Promise<StructuredExtractionResult> {
  if (!text || text.length < 20) {
    return { data: {}, confidence: 0, valid: false, issues: [] };
  }

  try {
    const { text: content } = await createTextResponse({
      model: "gpt-5.4-mini",
      temperature: 0,
      systemPrompt: `You are a CRE document data extractor. Extract structured data from the document text.
Return valid JSON matching the schema below. Use null for fields you cannot find. Use empty arrays [] for list fields with no matches.
Include a top-level "extraction_confidence" field (0.0-1.0) indicating your overall confidence.

${EXTRACTION_PROMPTS[docType]}`,
      userPrompt: text.slice(0, 12000),
    });

    if (!content) {
      return { data: {}, confidence: 0, valid: false, issues: [] };
    }

    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed)) {
      return {
        data: {},
        confidence: 0,
        valid: false,
        issues: ["root: Extractor did not return a JSON object"],
      };
    }

    const confidence =
      typeof parsed.extraction_confidence === "number"
        ? parsed.extraction_confidence
        : 0.5;

    const { extraction_confidence: _unusedConfidence, ...rawData } = parsed;
    const validated = validateExtractionPayload(docType, rawData);
    if (!validated.success) {
      return {
        data: {},
        confidence: 0,
        valid: false,
        issues: validated.issues,
      };
    }

    return {
      data: validated.data,
      confidence: Math.min(confidence, 0.98),
      valid: true,
      issues: [],
    };
  } catch (error) {
    logger.error("Document processing LLM extraction failed", serializeErrorForLogs(error));
    return { data: {}, confidence: 0, valid: false, issues: [] };
  }
}

/**
 * Downloads and extracts text from supported uploads.
 */
export async function extractDocumentTextForUpload(upload: {
  contentType: string;
  filename: string;
  storageObjectKey: string;
  orgId: string;
}): Promise<string> {
  const isPdf =
    upload.contentType === "application/pdf" || upload.filename.toLowerCase().endsWith(".pdf");
  const isDoc =
    upload.contentType.includes("word") || /\.docx?$/i.test(upload.filename);

  if (!isPdf && !isDoc) {
    return "";
  }

  const arrayBuf = await fetchObjectBytesFromGateway(
    upload.storageObjectKey,
    systemAuth(upload.orgId),
  );

  if (isPdf) {
    const buffer = Buffer.from(arrayBuf);
    let extractedText = await extractTextFromPdf(buffer);

    if (isScannedPdf(extractedText)) {
      logger.debug("Document processing scanned PDF detected", {
        filename: upload.filename,
      });
      try {
        const ocrText = await ocrPdfBuffer(buffer);
        if (ocrText.length >= MIN_TEXT_FOR_EXTRACTION) {
          extractedText = ocrText;
          logger.debug("Document processing OCR extracted text", {
            filename: upload.filename,
            textLength: ocrText.length,
          });
        }
      } catch (error) {
        logger.error("Document processing OCR fallback failed", {
          filename: upload.filename,
          ...serializeErrorForLogs(error),
        });
      }
    }

    return extractedText;
  }

  try {
    const { extractRawText } = await import("mammoth");
    const result = await extractRawText({ buffer: Buffer.from(arrayBuf) });
    const extractedText = result.value ?? "";
    logger.debug("Document processing Word extraction completed", {
      filename: upload.filename,
      textLength: extractedText.length,
    });
    return extractedText;
  } catch (error) {
    logger.error("Document processing Word extraction failed", {
      filename: upload.filename,
      ...serializeErrorForLogs(error),
    });
    return "";
  }
}

/**
 * Classifies a document from filename heuristics plus optional LLM fallback.
 */
export async function classifyDocumentUpload(
  filename: string,
  extractedText: string,
): Promise<{ docType: DocType; confidence: number }> {
  const regexResult = classifyByFilename(filename);
  if (
    extractedText.length <= MIN_TEXT_FOR_EXTRACTION ||
    (regexResult.confidence >= 0.85 && regexResult.docType !== "other")
  ) {
    return regexResult;
  }

  const llmResult = await classifyWithLLM(extractedText, filename);
  return llmResult.confidence > regexResult.confidence ? llmResult : regexResult;
}

/**
 * Extracts structured payloads for supported document types.
 */
export async function extractStructuredDocumentData(
  text: string,
  docType: DocType,
): Promise<StructuredExtractionResult> {
  return extractStructuredData(text, docType);
}

export { indexDocumentInQdrant };

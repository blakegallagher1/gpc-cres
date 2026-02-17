import { prisma } from "@entitlement-os/db";
import type { Prisma } from "@entitlement-os/db";
import { supabaseAdmin } from "@/lib/db/supabaseAdmin";
import { getNotificationService } from "./notification.service";
import { AppError } from "@/lib/errors";
import OpenAI from "openai";
import {
  EXTRACTION_SCHEMAS,
  DOC_TYPE_LABELS,
} from "@/lib/schemas/extractionSchemas";

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

export { DOC_TYPE_LABELS };

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
    const { extractText } = await import("unpdf");
    const result = await extractText(new Uint8Array(buffer), { mergePages: true });
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
  psa: `Extract ALL of the following fields from this Purchase & Sale Agreement (PSA).
For dollar amounts, extract as plain numbers (no commas, no "$"). For dates use YYYY-MM-DD. For lists, include every distinct item found.

Required JSON schema:
{
  "purchase_price": number or null — the total agreed purchase price,
  "earnest_money": number or null — earnest money / initial deposit amount,
  "due_diligence_period_days": number or null — number of calendar days for the due diligence / inspection period,
  "dd_start_date": "YYYY-MM-DD" or null — date the due diligence period begins (effective date if not explicit),
  "closing_date": "YYYY-MM-DD" or null — scheduled closing date,
  "contingencies": ["string"] — list of buyer contingencies (financing, inspection, appraisal, title, environmental, etc.),
  "seller_representations": ["string"] — list of seller representations and warranties,
  "special_provisions": ["string"] — any special provisions, addenda, or amendments,
  "buyer_entity": "string" or null — full legal name of the purchasing entity,
  "seller_entity": "string" or null — full legal name of the selling entity
}`,

  phase_i_esa: `Extract ALL of the following fields from this Phase I Environmental Site Assessment (ESA).
Focus on environmental findings, recognized conditions, and recommendations.

Required JSON schema:
{
  "recs": ["string"] — list of Recognized Environmental Conditions (RECs) identified. Include each REC as a separate item with a brief description,
  "de_minimis_conditions": ["string"] — list of de minimis conditions (minor issues not rising to REC level),
  "historical_uses": ["string"] — list of historical uses of the property found in records review (e.g., "Gas station 1960-1985", "Agricultural use pre-1950"),
  "adjoining_property_concerns": ["string"] — environmental concerns from adjacent/nearby properties,
  "recommended_phase_ii": true/false — whether the report recommends a Phase II investigation,
  "phase_ii_scope": "string" or null — recommended scope of Phase II if recommended (e.g., "soil sampling at former UST location"),
  "report_date": "YYYY-MM-DD" or null — date of the ESA report,
  "consultant": "string" or null — name of the environmental consulting firm
}`,

  title_commitment: `Extract ALL of the following fields from this Title Commitment / Title Report.
Carefully distinguish between Schedule A (requirements) and Schedule B (exceptions/encumbrances).

Required JSON schema:
{
  "commitment_date": "YYYY-MM-DD" or null — effective date of the commitment,
  "policy_amount": number or null — proposed policy amount in dollars,
  "requirements": ["string"] — Schedule A/B-I requirements that must be satisfied before policy issuance,
  "exceptions": ["string"] — Schedule B-II exceptions to coverage (each exception as a separate string),
  "easements": ["string"] — easements identified (extract from exceptions if embedded there),
  "liens": ["string"] — mortgages, judgment liens, tax liens, mechanic's liens identified,
  "encumbrances": ["string"] — other encumbrances: restrictive covenants, deed restrictions, HOA declarations,
  "title_company": "string" or null — name of the title company / underwriter
}`,

  survey: `Extract ALL of the following fields from this Survey / ALTA / Plat / Boundary document.
For setbacks, extract in feet. For acreage, extract the total even if composed of multiple tracts.

Required JSON schema:
{
  "total_acreage": number or null — total acreage (e.g., 5.23),
  "dimensions": "string" or null — overall lot dimensions or legal description summary (e.g., "330ft x 660ft irregular"),
  "flood_zone": "string" or null — FEMA flood zone designation (e.g., "Zone X", "Zone AE", "Zone A"),
  "flood_zone_panel": "string" or null — FIRM panel number (e.g., "22033C0375D"),
  "easement_locations": ["string"] — describe each easement with location and type (e.g., "15ft utility easement along north boundary"),
  "utility_locations": ["string"] — describe utility locations (e.g., "Water main along Main Street frontage", "Overhead power NW corner"),
  "setbacks": { "front": number or null, "side": number or null, "rear": number or null } — required setbacks in feet,
  "encroachments": ["string"] — any encroachments found (e.g., "Fence from adjacent parcel encroaches 2ft along east line"),
  "surveyor": "string" or null — name of surveyor or survey firm,
  "survey_date": "YYYY-MM-DD" or null — date of the survey
}`,

  zoning_letter: `Extract ALL of the following fields from this Zoning Letter / Zoning Verification / Zoning Compliance document.
For dimensional standards, extract numeric values in the units used (feet for setbacks/height, percentage for lot coverage).

Required JSON schema:
{
  "current_zoning": "string" or null — current zoning district code (e.g., "M-1", "C-2", "A-1"),
  "permitted_uses": ["string"] — uses permitted by-right in this zoning district,
  "conditional_uses": ["string"] — uses allowed by conditional use permit / special exception,
  "dimensional_standards": {
    "max_height": number or null — maximum building height in feet,
    "lot_coverage": number or null — maximum lot coverage as percentage (e.g., 60 for 60%),
    "far": number or null — floor area ratio (e.g., 1.5),
    "setbacks": { "front": number or null, "side": number or null, "rear": number or null } — required setbacks in feet
  },
  "variance_required": true/false — whether a variance or special exception is needed for the proposed use,
  "overlay_districts": ["string"] — any overlay districts that apply (e.g., "Historic Overlay", "Airport Noise Zone"),
  "jurisdiction": "string" or null — name of the zoning jurisdiction / municipality
}`,

  appraisal: `Extract ALL of the following fields from this Appraisal / Valuation Report.
For dollar amounts, extract as plain numbers. For cap rate, extract as decimal (e.g., 0.065 for 6.5%).

Required JSON schema:
{
  "appraised_value": number or null — final reconciled appraised value in dollars,
  "effective_date": "YYYY-MM-DD" or null — effective date of the appraisal,
  "property_type": "string" or null — property type classification (e.g., "Industrial", "Retail", "Office", "Multifamily", "Land"),
  "total_sf": number or null — total building area in square feet,
  "total_acreage": number or null — site/land area in acres,
  "approach_values": {
    "sales_comparison": number or null — value from sales comparison approach,
    "income": number or null — value from income capitalization approach,
    "cost": number or null — value from cost approach
  },
  "cap_rate": number or null — overall capitalization rate as decimal (0.065 = 6.5%),
  "noi": number or null — net operating income used in income approach,
  "highest_best_use": "string" or null — highest and best use conclusion,
  "appraiser": "string" or null — name of appraiser or appraisal firm
}`,

  lease: `Extract ALL of the following fields from this Lease / Rent Roll / Lease Abstract.
For dollar amounts, extract as plain numbers. lease_type must be one of: "NNN", "gross", or "modified_gross".

Required JSON schema:
{
  "tenant_name": "string" or null — full legal name of the tenant,
  "lease_type": "NNN" or "gross" or "modified_gross" or null — lease structure type,
  "term_years": number or null — lease term in years (e.g., 5, 10.5),
  "start_date": "YYYY-MM-DD" or null — lease commencement date,
  "expiration_date": "YYYY-MM-DD" or null — lease expiration date,
  "base_rent": number or null — annual base rent in dollars,
  "rent_per_sf": number or null — rent per square foot per year,
  "escalation_structure": "string" or null — describe rent escalation (e.g., "3% annual increase", "CPI-based", "Fixed bumps: $12/SF yr1, $12.50/SF yr2"),
  "renewal_options": ["string"] — each renewal option as a string (e.g., "Two 5-year options at fair market value"),
  "tenant_improvements": "string" or null — TI allowance or description (e.g., "$25/SF tenant improvement allowance"),
  "expense_stops": "string" or null — expense stop / base year provisions,
  "security_deposit": number or null — security deposit amount in dollars
}`,

  loi: `Extract ALL of the following fields from this Letter of Intent (LOI).
For dollar amounts, extract as plain numbers.

Required JSON schema:
{
  "purchase_price": number or null — proposed purchase price,
  "earnest_money": number or null — proposed earnest money / deposit,
  "due_diligence_days": number or null — proposed due diligence period in calendar days,
  "closing_timeline": "string" or null — proposed closing timeline (e.g., "45 days from execution", "March 15, 2026"),
  "contingencies": ["string"] — list of contingencies or conditions precedent,
  "buyer_entity": "string" or null — buyer entity name,
  "seller_entity": "string" or null — seller / property owner entity name,
  "expiration_date": "YYYY-MM-DD" or null — LOI expiration date,
  "financing_terms": "string" or null — proposed financing terms (e.g., "Cash at closing", "70% LTV conventional")
}`,

  other: `Extract any structured information you can identify from this document:
{
  "document_title": "string" or null — the document's title or heading,
  "document_date": "YYYY-MM-DD" or null — the date of the document,
  "key_parties": ["string"] — names of key parties mentioned,
  "key_figures": [{ "label": "string", "value": "string" }] — important numerical or factual data points,
  "summary": "string" or null — 2-3 sentence summary of the document's content and purpose
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
    const { extraction_confidence: _, ...rawData } = parsed;

    // Validate against Zod schema — use safeParse to be lenient
    const schema = EXTRACTION_SCHEMAS[docType];
    if (schema) {
      const result = schema.safeParse(rawData);
      if (result.success) {
        return { data: result.data as Record<string, unknown>, confidence: Math.min(confidence, 0.98) };
      }
      // If validation fails, still return raw data but reduce confidence
      console.warn(
        `[doc-processing] Zod validation failed for ${docType}:`,
        result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")
      );
      return { data: rawData, confidence: Math.min(confidence * 0.7, 0.6) };
    }

    return { data: rawData, confidence: Math.min(confidence, 0.98) };
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
      await this.autoFillDealFields(dealId, orgId, finalDocType, extractedData);
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
   * Only fills fields that are currently empty — never overwrites user data.
   */
  async autoFillDealFields(
    dealId: string,
    orgId: string,
    docType: DocType,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const parcels = await prisma.parcel.findMany({
        where: { dealId },
        select: { id: true, floodZone: true, acreage: true, currentZoning: true, envNotes: true, soilsNotes: true },
      });

      // Survey → flood zone, acreage
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

      // Zoning letter → current zoning
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

      // Phase I ESA → env notes + structured record
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

    const updated = await prisma.documentExtraction.update({
      where: { id: extractionId },
      data: updateData,
    });

    // Auto-fill deal fields with the confirmed extraction data
    const finalData = (updates?.extractedData ?? extraction.extractedData) as Record<string, unknown>;
    const finalDocType = (updates?.docType ?? extraction.docType) as DocType;
    if (Object.keys(finalData).length > 0) {
      await this.autoFillDealFields(extraction.dealId, extraction.orgId, finalDocType, finalData);
    }

    return updated;
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

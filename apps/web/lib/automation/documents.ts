import { AUTOMATION_CONFIG } from "./config";
import { createAutomationTask } from "./notifications";
import type { AutomationEvent } from "./events";
import { prisma } from "@entitlement-os/db";

/**
 * Document type classification based on filename and content type.
 * Maps known patterns to document categories.
 */
const CLASSIFICATION_RULES: ReadonlyArray<{
  pattern: RegExp;
  kind: string;
  confidence: number;
}> = [
  { pattern: /title/i, kind: "title", confidence: 0.9 },
  { pattern: /phase\s*[1i]\b|environmental\s*site/i, kind: "environmental", confidence: 0.85 },
  { pattern: /survey|plat|boundary/i, kind: "survey", confidence: 0.85 },
  { pattern: /appraisal|valuation/i, kind: "financial", confidence: 0.8 },
  { pattern: /loi|letter\s*of\s*intent|purchase\s*agreement/i, kind: "legal", confidence: 0.85 },
  { pattern: /lease|rent\s*roll/i, kind: "financial", confidence: 0.8 },
  { pattern: /zoning|variance|conditional\s*use/i, kind: "legal", confidence: 0.8 },
  { pattern: /flood|fema|firm/i, kind: "environmental", confidence: 0.8 },
  { pattern: /geotechnical|geotech|soils?\s*report/i, kind: "environmental", confidence: 0.85 },
  { pattern: /site\s*plan|concept\s*plan/i, kind: "survey", confidence: 0.8 },
  { pattern: /tax|assessment/i, kind: "financial", confidence: 0.7 },
  { pattern: /insurance|policy/i, kind: "financial", confidence: 0.7 },
  { pattern: /permit|application/i, kind: "legal", confidence: 0.7 },
];

export interface ClassificationResult {
  kind: string;
  confidence: number;
  rule: string | null;
}

/**
 * Classify a document by its filename.
 * Returns the best-matching kind with confidence score.
 * Falls back to "other" with 0.3 confidence if no rule matches.
 */
export function classifyDocument(filename: string): ClassificationResult {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.pattern.test(filename)) {
      return {
        kind: rule.kind,
        confidence: rule.confidence,
        rule: rule.pattern.source,
      };
    }
  }
  return { kind: "other", confidence: 0.3, rule: null };
}

/**
 * #6 Document Management: Auto-classify uploads and create review tasks.
 *
 * Triggered by: upload.created event
 * Actions:
 *   1. Classify document by filename
 *   2. If classification confidence < threshold: create review task
 *   3. If high confidence: update upload kind if it differs
 */
export async function handleUploadCreated(
  event: AutomationEvent
): Promise<void> {
  if (event.type !== "upload.created") return;

  const { uploadId, dealId, orgId } = event;

  // Load the upload
  const upload = await prisma.upload.findFirst({
    where: { id: uploadId, dealId, deal: { orgId } },
  });

  if (!upload) return;

  // Classify by filename
  const classification = classifyDocument(upload.filename);

  // If the upload was already classified by the user (kind !== "other"),
  // and our classification differs, flag for review
  if (upload.kind !== "other" && classification.kind !== upload.kind) {
    if (
      classification.confidence >=
      AUTOMATION_CONFIG.documents.classificationMinConfidence
    ) {
      // High confidence reclassification — suggest update
      await createAutomationTask({
        orgId,
        dealId,
        type: "classification_review",
        title: `Review document classification for "${upload.filename}"`,
        description: `File "${upload.filename}" was uploaded as "${upload.kind}" but auto-classification suggests "${classification.kind}" (${(classification.confidence * 100).toFixed(0)}% confidence). Please verify.`,
      });
    }
    return;
  }

  // If upload is "other" and we have a better classification
  if (
    upload.kind === "other" &&
    classification.kind !== "other" &&
    classification.confidence >=
      AUTOMATION_CONFIG.documents.classificationMinConfidence
  ) {
    // Auto-update the kind
    await prisma.upload.update({
      where: { id: uploadId },
      data: { kind: classification.kind },
    });
    console.log(
      `[automation] Auto-classified "${upload.filename}" as "${classification.kind}" (${(classification.confidence * 100).toFixed(0)}% confidence)`
    );
    return;
  }

  // Low confidence — create review task
  if (
    classification.confidence <
    AUTOMATION_CONFIG.documents.classificationMinConfidence
  ) {
    await createAutomationTask({
      orgId,
      dealId,
      type: "classification_review",
      title: `Classify uploaded document "${upload.filename}"`,
      description: `File "${upload.filename}" could not be auto-classified with sufficient confidence (${(classification.confidence * 100).toFixed(0)}%). Please review and categorize manually.`,
    });
  }
}

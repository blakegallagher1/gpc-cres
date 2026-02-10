import { z } from "zod";

import { ARTIFACT_TYPES } from "../enums.js";

const Url = z.string().url();

export const ArtifactSpecSchemaVersion = z.literal("1.0");

export const ArtifactSectionSchema = z.object({
  key: z.string().min(1),
  heading: z.string().min(1),
  body_markdown: z.string().min(1),
  sources: z.array(Url).optional(),
});

const BaseArtifactSpecSchema = z.object({
  schema_version: ArtifactSpecSchemaVersion,
  artifact_type: z.enum(ARTIFACT_TYPES),
  deal_id: z.string().uuid(),
  title: z.string().min(1),
  sections: z.array(ArtifactSectionSchema),
  sources_summary: z.array(Url),
});

export const TriagePdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("TRIAGE_PDF"),
});

export const BuyerTeaserPdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("BUYER_TEASER_PDF"),
});

export const SubmissionChecklistPdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("SUBMISSION_CHECKLIST_PDF"),
  checklist_items: z.array(
    z.object({
      item: z.string().min(1),
      required: z.boolean(),
      notes: z.string().min(1),
      sources: z.array(Url).min(1),
    }),
  ),
});

export const HearingDeckPptxArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("HEARING_DECK_PPTX"),
  slides: z.array(
    z.object({
      slide_no: z.number().int().min(1).max(10),
      title: z.string().min(1),
      bullets: z.array(z.string().min(1)).min(1),
      speaker_notes: z.string().min(1),
      sources: z.array(Url).optional(),
    }),
  ),
});

export const ExitPackagePdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("EXIT_PACKAGE_PDF"),
  approval_summary: z.string().min(1),
  conditions_summary: z.string().min(1),
  evidence_index: z.array(
    z.object({
      label: z.string().min(1),
      url: Url,
      notes: z.string().optional(),
    }),
  ),
});

export const InvestmentMemoPdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("INVESTMENT_MEMO_PDF"),
});

export const OfferingMemoPdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("OFFERING_MEMO_PDF"),
});

export const CompAnalysisPdfArtifactSpecSchema = BaseArtifactSpecSchema.extend({
  artifact_type: z.literal("COMP_ANALYSIS_PDF"),
  comparison_items: z.array(
    z.object({
      label: z.string().min(1),
      address: z.string().min(1),
      metrics: z.record(z.string(), z.string()),
    }),
  ),
  recommendation: z.string().min(1),
});

export const ArtifactSpecSchema = z.discriminatedUnion("artifact_type", [
  TriagePdfArtifactSpecSchema,
  SubmissionChecklistPdfArtifactSpecSchema,
  HearingDeckPptxArtifactSpecSchema,
  ExitPackagePdfArtifactSpecSchema,
  BuyerTeaserPdfArtifactSpecSchema,
  InvestmentMemoPdfArtifactSpecSchema,
  OfferingMemoPdfArtifactSpecSchema,
  CompAnalysisPdfArtifactSpecSchema,
]);

export type ArtifactSpec = z.infer<typeof ArtifactSpecSchema>;

// Convenience subtypes used by renderers/activities.
export type TriagePdfArtifactSpec = z.infer<typeof TriagePdfArtifactSpecSchema>;
export type BuyerTeaserPdfArtifactSpec = z.infer<typeof BuyerTeaserPdfArtifactSpecSchema>;
export type SubmissionChecklistPdfArtifactSpec = z.infer<typeof SubmissionChecklistPdfArtifactSpecSchema>;
export type HearingDeckPptxArtifactSpec = z.infer<typeof HearingDeckPptxArtifactSpecSchema>;
export type ExitPackagePdfArtifactSpec = z.infer<typeof ExitPackagePdfArtifactSpecSchema>;
export type InvestmentMemoPdfArtifactSpec = z.infer<typeof InvestmentMemoPdfArtifactSpecSchema>;
export type OfferingMemoPdfArtifactSpec = z.infer<typeof OfferingMemoPdfArtifactSpecSchema>;
export type CompAnalysisPdfArtifactSpec = z.infer<typeof CompAnalysisPdfArtifactSpecSchema>;

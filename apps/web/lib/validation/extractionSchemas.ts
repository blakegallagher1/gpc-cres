import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const DateStringSchema = z.string().regex(DATE_REGEX, "Expected YYYY-MM-DD");
const NullableDateStringSchema = DateStringSchema.nullable();
const NullableNumberSchema = z.number().finite().nullable();
const NonEmptyNullableStringSchema = z.string().trim().min(1).nullable();
const StringListSchema = z.array(z.string().trim().min(1));

const SetbacksSchema = z
  .object({
    front: NullableNumberSchema,
    side: NullableNumberSchema,
    rear: NullableNumberSchema,
  })
  .strict();

const JsonValueSchema: z.ZodType<
  string | number | boolean | null | Record<string, unknown> | Array<unknown>
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const DocTypeSchema = z.enum([
  "psa",
  "phase_i_esa",
  "title_commitment",
  "survey",
  "zoning_letter",
  "appraisal",
  "lease",
  "loi",
  "other",
]);

export type DocType = z.infer<typeof DocTypeSchema>;

export const DOC_TYPE_LABELS: Record<DocType, string> = {
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

export const PsaExtractionSchema = z
  .object({
    purchase_price: NullableNumberSchema,
    earnest_money: NullableNumberSchema,
    due_diligence_period_days: z.number().int().nonnegative().nullable(),
    dd_start_date: NullableDateStringSchema,
    closing_date: NullableDateStringSchema,
    contingencies: StringListSchema,
    seller_representations: StringListSchema,
    special_provisions: StringListSchema,
    buyer_entity: NonEmptyNullableStringSchema,
    seller_entity: NonEmptyNullableStringSchema,
  })
  .strict();

export const PhaseIEsaExtractionSchema = z
  .object({
    recs: StringListSchema,
    de_minimis_conditions: StringListSchema,
    historical_uses: StringListSchema,
    adjoining_property_concerns: StringListSchema,
    recommended_phase_ii: z.boolean(),
    phase_ii_scope: NonEmptyNullableStringSchema,
    report_date: NullableDateStringSchema,
    consultant: NonEmptyNullableStringSchema,
  })
  .strict();

export const TitleCommitmentExtractionSchema = z
  .object({
    commitment_date: NullableDateStringSchema,
    policy_amount: NullableNumberSchema,
    requirements: StringListSchema,
    exceptions: StringListSchema,
    easements: StringListSchema,
    liens: StringListSchema,
    encumbrances: StringListSchema,
    title_company: NonEmptyNullableStringSchema,
  })
  .strict();

export const SurveyExtractionSchema = z
  .object({
    total_acreage: NullableNumberSchema,
    dimensions: NonEmptyNullableStringSchema,
    flood_zone: NonEmptyNullableStringSchema,
    flood_zone_panel: NonEmptyNullableStringSchema,
    easement_locations: StringListSchema,
    utility_locations: StringListSchema,
    setbacks: SetbacksSchema,
    encroachments: StringListSchema,
    surveyor: NonEmptyNullableStringSchema,
    survey_date: NullableDateStringSchema,
  })
  .strict();

export const ZoningLetterExtractionSchema = z
  .object({
    current_zoning: NonEmptyNullableStringSchema,
    permitted_uses: StringListSchema,
    conditional_uses: StringListSchema,
    dimensional_standards: z
      .object({
        max_height: NullableNumberSchema,
        lot_coverage: NullableNumberSchema,
        far: NullableNumberSchema,
        setbacks: SetbacksSchema,
      })
      .strict(),
    variance_required: z.boolean(),
    overlay_districts: StringListSchema,
    jurisdiction: NonEmptyNullableStringSchema,
  })
  .strict();

export const LeaseExtractionSchema = z
  .object({
    tenant_name: NonEmptyNullableStringSchema,
    lease_type: z.enum(["NNN", "gross", "modified_gross"]).nullable(),
    term_years: NullableNumberSchema,
    start_date: NullableDateStringSchema,
    expiration_date: NullableDateStringSchema,
    base_rent: NullableNumberSchema,
    rent_per_sf: NullableNumberSchema,
    escalation_structure: NonEmptyNullableStringSchema,
    renewal_options: StringListSchema,
    tenant_improvements: NonEmptyNullableStringSchema,
    expense_stops: NonEmptyNullableStringSchema,
    security_deposit: NullableNumberSchema,
  })
  .strict();

export const AppraisalExtractionSchema = z
  .object({
    appraised_value: NullableNumberSchema,
    effective_date: NullableDateStringSchema,
    property_type: NonEmptyNullableStringSchema,
    total_sf: NullableNumberSchema,
    total_acreage: NullableNumberSchema,
    approach_values: z
      .object({
        sales_comparison: NullableNumberSchema,
        income: NullableNumberSchema,
        cost: NullableNumberSchema,
      })
      .strict(),
    cap_rate: NullableNumberSchema,
    noi: NullableNumberSchema,
    highest_best_use: NonEmptyNullableStringSchema,
    appraiser: NonEmptyNullableStringSchema,
  })
  .strict();

export const LoiExtractionSchema = z
  .object({
    purchase_price: NullableNumberSchema,
    earnest_money: NullableNumberSchema,
    due_diligence_days: z.number().int().nonnegative().nullable(),
    closing_timeline: NonEmptyNullableStringSchema,
    contingencies: StringListSchema,
    buyer_entity: NonEmptyNullableStringSchema,
    seller_entity: NonEmptyNullableStringSchema,
    expiration_date: NullableDateStringSchema,
    financing_terms: NonEmptyNullableStringSchema,
  })
  .strict();

export const EXTRACTION_SCHEMAS = {
  psa: PsaExtractionSchema,
  phase_i_esa: PhaseIEsaExtractionSchema,
  title_commitment: TitleCommitmentExtractionSchema,
  survey: SurveyExtractionSchema,
  zoning_letter: ZoningLetterExtractionSchema,
  appraisal: AppraisalExtractionSchema,
  lease: LeaseExtractionSchema,
  loi: LoiExtractionSchema,
  other: JsonObjectSchema,
} as const;

export type ExtractionPayloadByDocType = {
  [K in DocType]: z.infer<(typeof EXTRACTION_SCHEMAS)[K]>;
};

export const TriggerExtractionRequestSchema = z
  .object({
    uploadId: z.string().trim().min(1),
  })
  .strict();

export const PatchExtractionRequestSchema = z
  .object({
    extractedData: JsonObjectSchema.optional(),
    docType: DocTypeSchema.optional(),
    reviewed: z.boolean().optional(),
  })
  .strict();

export function validateExtractionPayload(
  docType: DocType,
  payload: unknown
):
  | { success: true; data: Record<string, unknown> }
  | { success: false; issues: string[] } {
  const result = EXTRACTION_SCHEMAS[docType].safeParse(payload);

  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => {
        const path = issue.path.length === 0 ? "root" : issue.path.join(".");
        return `${path}: ${issue.message}`;
      }),
    };
  }

  return { success: true, data: result.data as Record<string, unknown> };
}

export function serializeExtractionPayload(
  docType: DocType,
  payload: unknown
): Record<string, unknown> {
  const validated = validateExtractionPayload(docType, payload);
  return validated.success ? validated.data : {};
}

import { z } from "zod";

// ---------------------------------------------------------------------------
// Per-doc-type Zod schemas for validating LLM extraction output
// ---------------------------------------------------------------------------

export const PsaExtractionSchema = z.object({
  purchase_price: z.number().nullable(),
  earnest_money: z.number().nullable(),
  due_diligence_period_days: z.number().nullable(),
  dd_start_date: z.string().nullable(),
  closing_date: z.string().nullable(),
  contingencies: z.array(z.string()),
  seller_representations: z.array(z.string()),
  special_provisions: z.array(z.string()),
  buyer_entity: z.string().nullable(),
  seller_entity: z.string().nullable(),
});
export type PsaExtraction = z.infer<typeof PsaExtractionSchema>;

export const PhaseIEsaExtractionSchema = z.object({
  recs: z.array(z.string()),
  de_minimis_conditions: z.array(z.string()),
  historical_uses: z.array(z.string()),
  adjoining_property_concerns: z.array(z.string()),
  recommended_phase_ii: z.boolean(),
  phase_ii_scope: z.string().nullable(),
  report_date: z.string().nullable(),
  consultant: z.string().nullable(),
});
export type PhaseIEsaExtraction = z.infer<typeof PhaseIEsaExtractionSchema>;

export const TitleCommitmentExtractionSchema = z.object({
  commitment_date: z.string().nullable(),
  policy_amount: z.number().nullable(),
  requirements: z.array(z.string()),
  exceptions: z.array(z.string()),
  easements: z.array(z.string()),
  liens: z.array(z.string()),
  encumbrances: z.array(z.string()),
  title_company: z.string().nullable(),
});
export type TitleCommitmentExtraction = z.infer<typeof TitleCommitmentExtractionSchema>;

export const SetbacksSchema = z.object({
  front: z.number().nullable(),
  side: z.number().nullable(),
  rear: z.number().nullable(),
});

export const SurveyExtractionSchema = z.object({
  total_acreage: z.number().nullable(),
  dimensions: z.string().nullable(),
  flood_zone: z.string().nullable(),
  flood_zone_panel: z.string().nullable(),
  easement_locations: z.array(z.string()),
  utility_locations: z.array(z.string()),
  setbacks: SetbacksSchema,
  encroachments: z.array(z.string()),
  surveyor: z.string().nullable(),
  survey_date: z.string().nullable(),
});
export type SurveyExtraction = z.infer<typeof SurveyExtractionSchema>;

export const ZoningLetterExtractionSchema = z.object({
  current_zoning: z.string().nullable(),
  permitted_uses: z.array(z.string()),
  conditional_uses: z.array(z.string()),
  dimensional_standards: z.object({
    max_height: z.number().nullable(),
    lot_coverage: z.number().nullable(),
    far: z.number().nullable(),
    setbacks: SetbacksSchema,
  }),
  variance_required: z.boolean(),
  overlay_districts: z.array(z.string()),
  jurisdiction: z.string().nullable(),
});
export type ZoningLetterExtraction = z.infer<typeof ZoningLetterExtractionSchema>;

export const AppraisalExtractionSchema = z.object({
  appraised_value: z.number().nullable(),
  effective_date: z.string().nullable(),
  property_type: z.string().nullable(),
  total_sf: z.number().nullable(),
  total_acreage: z.number().nullable(),
  approach_values: z.object({
    sales_comparison: z.number().nullable(),
    income: z.number().nullable(),
    cost: z.number().nullable(),
  }),
  cap_rate: z.number().nullable(),
  noi: z.number().nullable(),
  highest_best_use: z.string().nullable(),
  appraiser: z.string().nullable(),
});
export type AppraisalExtraction = z.infer<typeof AppraisalExtractionSchema>;

export const LeaseExtractionSchema = z.object({
  tenant_name: z.string().nullable(),
  lease_type: z.enum(["NNN", "gross", "modified_gross"]).nullable(),
  term_years: z.number().nullable(),
  start_date: z.string().nullable(),
  expiration_date: z.string().nullable(),
  base_rent: z.number().nullable(),
  rent_per_sf: z.number().nullable(),
  escalation_structure: z.string().nullable(),
  renewal_options: z.array(z.string()),
  tenant_improvements: z.string().nullable(),
  expense_stops: z.string().nullable(),
  security_deposit: z.number().nullable(),
});
export type LeaseExtraction = z.infer<typeof LeaseExtractionSchema>;

export const LoiExtractionSchema = z.object({
  purchase_price: z.number().nullable(),
  earnest_money: z.number().nullable(),
  due_diligence_days: z.number().nullable(),
  closing_timeline: z.string().nullable(),
  contingencies: z.array(z.string()),
  buyer_entity: z.string().nullable(),
  seller_entity: z.string().nullable(),
  expiration_date: z.string().nullable(),
  financing_terms: z.string().nullable(),
});
export type LoiExtraction = z.infer<typeof LoiExtractionSchema>;

export const OtherExtractionSchema = z.object({
  document_title: z.string().nullable(),
  document_date: z.string().nullable(),
  key_parties: z.array(z.string()),
  key_figures: z.array(z.object({ label: z.string(), value: z.string() })),
  summary: z.string().nullable(),
});
export type OtherExtraction = z.infer<typeof OtherExtractionSchema>;

// Map doc type to its schema
export const EXTRACTION_SCHEMAS: Record<string, z.ZodType> = {
  psa: PsaExtractionSchema,
  phase_i_esa: PhaseIEsaExtractionSchema,
  title_commitment: TitleCommitmentExtractionSchema,
  survey: SurveyExtractionSchema,
  zoning_letter: ZoningLetterExtractionSchema,
  appraisal: AppraisalExtractionSchema,
  lease: LeaseExtractionSchema,
  loi: LoiExtractionSchema,
  other: OtherExtractionSchema,
};

// Human-readable field labels for the review UI
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  psa: {
    purchase_price: "Purchase Price",
    earnest_money: "Earnest Money",
    due_diligence_period_days: "DD Period (days)",
    dd_start_date: "DD Start Date",
    closing_date: "Closing Date",
    contingencies: "Contingencies",
    seller_representations: "Seller Representations",
    special_provisions: "Special Provisions",
    buyer_entity: "Buyer Entity",
    seller_entity: "Seller Entity",
  },
  phase_i_esa: {
    recs: "Recognized Environmental Conditions",
    de_minimis_conditions: "De Minimis Conditions",
    historical_uses: "Historical Uses",
    adjoining_property_concerns: "Adjoining Property Concerns",
    recommended_phase_ii: "Phase II Recommended",
    phase_ii_scope: "Phase II Scope",
    report_date: "Report Date",
    consultant: "Consultant",
  },
  title_commitment: {
    commitment_date: "Commitment Date",
    policy_amount: "Policy Amount",
    requirements: "Requirements",
    exceptions: "Exceptions",
    easements: "Easements",
    liens: "Liens",
    encumbrances: "Encumbrances",
    title_company: "Title Company",
  },
  survey: {
    total_acreage: "Total Acreage",
    dimensions: "Dimensions",
    flood_zone: "Flood Zone",
    flood_zone_panel: "FIRM Panel",
    easement_locations: "Easement Locations",
    utility_locations: "Utility Locations",
    setbacks: "Setbacks (ft)",
    encroachments: "Encroachments",
    surveyor: "Surveyor",
    survey_date: "Survey Date",
  },
  zoning_letter: {
    current_zoning: "Current Zoning",
    permitted_uses: "Permitted Uses",
    conditional_uses: "Conditional Uses",
    dimensional_standards: "Dimensional Standards",
    variance_required: "Variance Required",
    overlay_districts: "Overlay Districts",
    jurisdiction: "Jurisdiction",
  },
  appraisal: {
    appraised_value: "Appraised Value",
    effective_date: "Effective Date",
    property_type: "Property Type",
    total_sf: "Total SF",
    total_acreage: "Total Acreage",
    approach_values: "Approach Values",
    cap_rate: "Cap Rate",
    noi: "NOI",
    highest_best_use: "Highest & Best Use",
    appraiser: "Appraiser",
  },
  lease: {
    tenant_name: "Tenant Name",
    lease_type: "Lease Type",
    term_years: "Term (years)",
    start_date: "Start Date",
    expiration_date: "Expiration Date",
    base_rent: "Base Rent",
    rent_per_sf: "Rent/SF",
    escalation_structure: "Escalation Structure",
    renewal_options: "Renewal Options",
    tenant_improvements: "Tenant Improvements",
    expense_stops: "Expense Stops",
    security_deposit: "Security Deposit",
  },
  loi: {
    purchase_price: "Purchase Price",
    earnest_money: "Earnest Money",
    due_diligence_days: "DD Period (days)",
    closing_timeline: "Closing Timeline",
    contingencies: "Contingencies",
    buyer_entity: "Buyer Entity",
    seller_entity: "Seller Entity",
    expiration_date: "Expiration Date",
    financing_terms: "Financing Terms",
  },
  other: {
    document_title: "Document Title",
    document_date: "Document Date",
    key_parties: "Key Parties",
    key_figures: "Key Figures",
    summary: "Summary",
  },
};

export const DOC_TYPE_LABELS: Record<string, string> = {
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

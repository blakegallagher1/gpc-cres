import { z } from "zod";

export const OpportunityScorecardSchemaVersion = z.literal("1.0");

export const OpportunityStageSchema = z.enum([
  "intake",
  "underwriting",
  "entitlement_probability",
  "execution_risk",
  "exit_confidence",
]);

export const RecommendationSchema = z.enum([
  "ADVANCE",
  "HOLD",
  "KILL",
  "INVESTIGATE",
  "PENDING",
]);

export const StageStatusSchema = z.enum(["complete", "provisional", "pending"]);

export const EvidenceReferenceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
});

export const DescriptiveFactSchema = z.object({
  metric: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().min(1).optional(),
  evidence_refs: z.array(z.string().min(1)),
});

export const DescriptiveAnalyticsSchema = z.object({
  status: StageStatusSchema,
  summary: z.string().min(1),
  facts: z.array(DescriptiveFactSchema),
  confidence: z.number().min(0).max(1),
  evidence_refs: z.array(z.string().min(1)),
});

export const PrescriptiveActionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  owner_role: z.string().min(1).optional(),
  due_in_days: z.number().int().min(0).max(365).optional(),
  evidence_refs: z.array(z.string().min(1)),
});

export const PrescriptiveRecommendationSchema = z.object({
  status: StageStatusSchema,
  recommendation: RecommendationSchema,
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  actions: z.array(PrescriptiveActionSchema),
  evidence_refs: z.array(z.string().min(1)),
});

export const StageAssessmentSchema = z.object({
  stage: OpportunityStageSchema,
  descriptive: DescriptiveAnalyticsSchema,
  prescriptive: PrescriptiveRecommendationSchema,
});

export const ScenarioNameSchema = z.enum(["base", "upside", "downside"]);

export const ScenarioParameterSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  unit: z.string().min(1).optional(),
  provenance: z.string().min(1),
  evidence_refs: z.array(z.string().min(1)),
});

export const ScenarioSchema = z.object({
  name: ScenarioNameSchema,
  assumptions_hash: z.string().length(64),
  parameters: z.array(ScenarioParameterSchema),
});

export const ScenarioChangeSchema = z.object({
  scenario: z.enum(["upside", "downside"]),
  key: z.string().min(1),
  from: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  to: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  rationale: z.string().min(1),
});

export const ScenarioEnvelopeSchema = z.object({
  base: ScenarioSchema,
  upside: ScenarioSchema,
  downside: ScenarioSchema,
  changes: z.array(ScenarioChangeSchema),
});

export const OpportunityScorecardSchema = z.object({
  schema_version: OpportunityScorecardSchemaVersion,
  generated_at: z.string().min(1),
  deal_id: z.string().min(1),
  overall_recommendation: RecommendationSchema,
  overall_confidence: z.number().min(0).max(1),
  evidence_references: z.array(EvidenceReferenceSchema),
  stage_assessments: z.object({
    intake: StageAssessmentSchema,
    underwriting: StageAssessmentSchema,
    entitlement_probability: StageAssessmentSchema,
    execution_risk: StageAssessmentSchema,
    exit_confidence: StageAssessmentSchema,
  }),
  scenario_envelope: ScenarioEnvelopeSchema,
  rerun_policy: z.object({
    input_hash: z.string().length(64),
    deterministic: z.boolean(),
    rerun_reason: z.string().min(1),
  }),
});

export type OpportunityScorecard = z.infer<typeof OpportunityScorecardSchema>;
export type ScenarioEnvelope = z.infer<typeof ScenarioEnvelopeSchema>;

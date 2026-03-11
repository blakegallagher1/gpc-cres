import { z } from "zod";

import {
  AssetSchema,
  DealAssetClassSchema,
  DealGeneralizationFieldsSchema,
  DealSourceTypeSchema,
  DealStageKeySchema,
  DealStrategySchema,
  LegacyDealStatusSchema,
  LegacySkuSchema,
  OpportunityKindSchema,
  WorkflowStageSchema,
  WorkflowTemplateKeySchema,
  WorkflowTemplateSchema,
} from "./opportunityGeneralization.js";
import { OpportunityScorecardSchema } from "./opportunityScorecard.js";
import { ParcelTriageSchema } from "./parcelTriage.js";

const nullableStringSchema = z.string().nullable();
const nullableNumberLikeSchema = z.union([z.number(), z.string(), z.null()]);

export const DealCreateCompatibilityRequestSchema = z
  .object({
    name: z.string(),
    sku: LegacySkuSchema.nullable(),
    jurisdictionId: z.string().nullable(),
    notes: nullableStringSchema,
    targetCloseDate: nullableStringSchema,
    parcelAddress: nullableStringSchema,
    apn: nullableStringSchema,
  })
  .extend(DealGeneralizationFieldsSchema.shape);

export const DealUpdateCompatibilityRequestSchema = z
  .object({
    name: nullableStringSchema,
    sku: LegacySkuSchema.nullable(),
    status: LegacyDealStatusSchema.nullable(),
    jurisdictionId: nullableStringSchema,
    notes: nullableStringSchema,
    targetCloseDate: nullableStringSchema,
  })
  .extend(DealGeneralizationFieldsSchema.shape);

export const DealCompatibilityResponseSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  jurisdictionId: z.string(),
  sku: LegacySkuSchema,
  status: LegacyDealStatusSchema,
  assetClass: DealAssetClassSchema.nullable(),
  assetSubtype: nullableStringSchema,
  strategy: DealStrategySchema.nullable(),
  workflowTemplateKey: WorkflowTemplateKeySchema.nullable(),
  currentStageKey: DealStageKeySchema.nullable(),
  opportunityKind: OpportunityKindSchema.nullable(),
  dealSourceType: DealSourceTypeSchema.nullable(),
  primaryAssetId: nullableStringSchema,
  marketName: nullableStringSchema,
  investmentSummary: nullableStringSchema,
  businessPlanSummary: nullableStringSchema,
  legacySku: LegacySkuSchema.nullable(),
  legacyStatus: LegacyDealStatusSchema.nullable(),
  targetCloseDate: nullableStringSchema,
  notes: nullableStringSchema,
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  jurisdiction: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
});

export const WorkflowStageCreateRequestSchema = z.object({
  key: DealStageKeySchema.nullable(),
  name: z.string(),
  ordinal: z.number().int().nullable(),
  description: nullableStringSchema,
  requiredGate: nullableStringSchema,
});

export const WorkflowTemplateCreateRequestSchema = z.object({
  key: WorkflowTemplateKeySchema.nullable(),
  name: z.string(),
  description: nullableStringSchema,
  isDefault: z.boolean(),
  stages: z.array(WorkflowStageCreateRequestSchema),
});

export const WorkflowTemplateDetailSchema = WorkflowTemplateSchema.extend({
  stages: z.array(WorkflowStageSchema),
});

export const WorkflowTemplateListResponseSchema = z.object({
  workflowTemplates: z.array(WorkflowTemplateSchema),
});

export const WorkflowTemplateDetailResponseSchema = z.object({
  workflowTemplate: WorkflowTemplateDetailSchema,
});

export const AssetCreateRequestSchema = z.object({
  name: z.string(),
  address: nullableStringSchema,
  city: nullableStringSchema,
  state: nullableStringSchema,
  zip: nullableStringSchema,
  county: nullableStringSchema,
  parcelNumber: nullableStringSchema,
  assetClass: DealAssetClassSchema.nullable(),
  assetSubtype: nullableStringSchema,
  lat: nullableNumberLikeSchema,
  lng: nullableNumberLikeSchema,
  acreage: nullableNumberLikeSchema,
  sfGross: nullableNumberLikeSchema,
  sfNet: nullableNumberLikeSchema,
  yearBuilt: z.number().int().nullable(),
  zoning: nullableStringSchema,
  zoningDescription: nullableStringSchema,
});

export const AssetUpdateRequestSchema = z.object({
  name: nullableStringSchema,
  address: nullableStringSchema,
  city: nullableStringSchema,
  state: nullableStringSchema,
  zip: nullableStringSchema,
  county: nullableStringSchema,
  parcelNumber: nullableStringSchema,
  assetClass: DealAssetClassSchema.nullable(),
  assetSubtype: nullableStringSchema,
  lat: nullableNumberLikeSchema,
  lng: nullableNumberLikeSchema,
  acreage: nullableNumberLikeSchema,
  sfGross: nullableNumberLikeSchema,
  sfNet: nullableNumberLikeSchema,
  yearBuilt: z.number().int().nullable(),
  zoning: nullableStringSchema,
  zoningDescription: nullableStringSchema,
});

export const AssetListResponseSchema = z.object({
  assets: z.array(AssetSchema),
});

export const AssetResponseSchema = z.object({
  asset: AssetSchema,
});

export const AssetDealAssociationSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  dealId: z.string(),
  assetId: z.string(),
  role: z.string(),
  createdAt: z.string(),
  deal: z.object({
    id: z.string(),
    name: z.string(),
    sku: LegacySkuSchema,
    status: LegacyDealStatusSchema,
    legacySku: LegacySkuSchema.nullable(),
    legacyStatus: LegacyDealStatusSchema.nullable(),
    assetClass: DealAssetClassSchema.nullable(),
    strategy: DealStrategySchema.nullable(),
    workflowTemplateKey: WorkflowTemplateKeySchema.nullable(),
    currentStageKey: DealStageKeySchema.nullable(),
  }),
});

export const AssetDetailSchema = AssetSchema.extend({
  dealAssociations: z.array(AssetDealAssociationSchema),
});

export const AssetDetailResponseSchema = z.object({
  asset: AssetDetailSchema,
});

export const DealScreenRequestSchema = z.object({
  workflowTemplateKey: WorkflowTemplateKeySchema.nullable(),
});

export const DealScreenRunSchema = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: nullableStringSchema,
  finishedAt: nullableStringSchema,
});

export const DealScreenPayloadSchema = z.object({
  templateKey: WorkflowTemplateKeySchema,
  triage: ParcelTriageSchema.nullable(),
  triageScore: z.number().nullable(),
  summary: nullableStringSchema,
  scorecard: OpportunityScorecardSchema.nullable(),
  routing: z.record(z.string(), z.unknown()).nullable(),
  rerun: z
    .object({
      reusedPreviousRun: z.boolean(),
      reason: z.string(),
      sourceRunId: nullableStringSchema,
    })
    .nullable(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: nullableStringSchema,
    }),
  ),
  screenStatus: nullableStringSchema,
});

export const DealScreenResponseSchema = z.object({
  run: DealScreenRunSchema.nullable(),
  screen: DealScreenPayloadSchema.nullable(),
  triage: ParcelTriageSchema.nullable(),
  triageScore: z.number().nullable(),
  summary: nullableStringSchema,
  scorecard: OpportunityScorecardSchema.nullable(),
  routing: z.record(z.string(), z.unknown()).nullable(),
  rerun: z
    .object({
      reusedPreviousRun: z.boolean(),
      reason: z.string(),
      sourceRunId: nullableStringSchema,
    })
    .nullable(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: nullableStringSchema,
    }),
  ),
});

export type DealCreateCompatibilityRequest = z.infer<typeof DealCreateCompatibilityRequestSchema>;
export type DealUpdateCompatibilityRequest = z.infer<typeof DealUpdateCompatibilityRequestSchema>;
export type DealCompatibilityResponse = z.infer<typeof DealCompatibilityResponseSchema>;
export type WorkflowTemplateCreateRequest = z.infer<typeof WorkflowTemplateCreateRequestSchema>;
export type WorkflowTemplateDetail = z.infer<typeof WorkflowTemplateDetailSchema>;
export type AssetCreateRequest = z.infer<typeof AssetCreateRequestSchema>;
export type AssetUpdateRequest = z.infer<typeof AssetUpdateRequestSchema>;
export type AssetDetail = z.infer<typeof AssetDetailSchema>;
export type DealScreenRequest = z.infer<typeof DealScreenRequestSchema>;
export type DealScreenPayload = z.infer<typeof DealScreenPayloadSchema>;
export type DealScreenResponse = z.infer<typeof DealScreenResponseSchema>;

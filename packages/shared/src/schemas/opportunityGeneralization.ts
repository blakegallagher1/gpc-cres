import { z } from "zod";

import {
  DEAL_ASSET_CLASSES,
  DEAL_ASSET_ROLES,
  DEAL_SOURCE_TYPES,
  DEAL_STAGE_KEYS,
  DEAL_STATUSES,
  DEAL_STRATEGIES,
  OPPORTUNITY_KINDS,
  SKU_TYPES,
  WORKFLOW_TEMPLATE_KEYS,
} from "../enums.js";

const timestampSchema = z.preprocess((value) => {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  return value;
}, z.date());

const decimalLikeSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    try {
      return value.toNumber();
    } catch {
      return value;
    }
  }

  return value;
}, z.number());

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const DealAssetClassSchema = z.enum(DEAL_ASSET_CLASSES);
export const DealStrategySchema = z.enum(DEAL_STRATEGIES);
export const WorkflowTemplateKeySchema = z.enum(WORKFLOW_TEMPLATE_KEYS);
export const DealStageKeySchema = z.enum(DEAL_STAGE_KEYS);
export const OpportunityKindSchema = z.enum(OPPORTUNITY_KINDS);
export const DealSourceTypeSchema = z.enum(DEAL_SOURCE_TYPES);
export const DealAssetRoleSchema = z.enum(DEAL_ASSET_ROLES);
export const LegacySkuSchema = z.enum(SKU_TYPES);
export const LegacyDealStatusSchema = z.enum(DEAL_STATUSES);

export const DealGeneralizationFieldsSchema = z.object({
  assetClass: DealAssetClassSchema.nullable(),
  assetSubtype: z.string().nullable(),
  strategy: DealStrategySchema.nullable(),
  workflowTemplateKey: WorkflowTemplateKeySchema.nullable(),
  currentStageKey: DealStageKeySchema.nullable(),
  opportunityKind: OpportunityKindSchema.nullable(),
  dealSourceType: DealSourceTypeSchema.nullable(),
  primaryAssetId: z.string().nullable(),
  marketName: z.string().nullable(),
  investmentSummary: z.string().nullable(),
  businessPlanSummary: z.string().nullable(),
  legacySku: LegacySkuSchema.nullable(),
  legacyStatus: LegacyDealStatusSchema.nullable(),
});

export const AssetSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  county: z.string().nullable(),
  parcelNumber: z.string().nullable(),
  assetClass: DealAssetClassSchema.nullable(),
  assetSubtype: z.string().nullable(),
  lat: decimalLikeSchema.nullable(),
  lng: decimalLikeSchema.nullable(),
  acreage: decimalLikeSchema.nullable(),
  sfGross: decimalLikeSchema.nullable(),
  sfNet: decimalLikeSchema.nullable(),
  yearBuilt: z.number().int().nullable(),
  zoning: z.string().nullable(),
  zoningDescription: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const DealAssetSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  dealId: z.string(),
  assetId: z.string(),
  role: DealAssetRoleSchema,
  createdAt: timestampSchema,
});

export const WorkflowTemplateSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  key: WorkflowTemplateKeySchema,
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export const WorkflowStageSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  templateId: z.string(),
  key: DealStageKeySchema,
  name: z.string(),
  ordinal: z.number().int(),
  description: z.string().nullable(),
  requiredGate: z.string().nullable(),
  createdAt: timestampSchema,
});

export const DealStageHistorySchema = z.object({
  id: z.string(),
  dealId: z.string(),
  orgId: z.string(),
  fromStageKey: DealStageKeySchema.nullable(),
  toStageKey: DealStageKeySchema,
  changedBy: z.string().nullable(),
  changedAt: timestampSchema,
  note: z.string().nullable(),
});

export const GeneralizedScorecardSchema = z.object({
  id: z.string(),
  dealId: z.string(),
  orgId: z.string(),
  module: z.string(),
  dimension: z.string(),
  score: decimalLikeSchema,
  weight: decimalLikeSchema.nullable(),
  evidence: z.string().nullable(),
  scoredAt: timestampSchema,
  scoredBy: z.string().nullable(),
});

export const ModuleStateSchema = z.object({
  id: z.string(),
  dealId: z.string(),
  orgId: z.string(),
  module: z.string(),
  stateJson: jsonValueSchema,
  version: z.number().int(),
  updatedAt: timestampSchema,
  updatedBy: z.string().nullable(),
});

export type DealGeneralizationFields = z.infer<typeof DealGeneralizationFieldsSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type DealAsset = z.infer<typeof DealAssetSchema>;
export type WorkflowTemplate = z.infer<typeof WorkflowTemplateSchema>;
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;
export type DealStageHistory = z.infer<typeof DealStageHistorySchema>;
export type GeneralizedScorecard = z.infer<typeof GeneralizedScorecardSchema>;
export type ModuleState = z.infer<typeof ModuleStateSchema>;

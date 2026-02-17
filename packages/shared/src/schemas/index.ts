import { z } from "zod";

export * from "./agentReport.js";
export * from "./parishPack.js";
export * from "./parcelTriage.js";
export * from "./artifactSpec.js";
export * from "./opportunityScorecard.js";
export * from "./dealOutcome.js";
export * from "./dealTerms.js";
export * from "./entitlementPath.js";
export * from "./dealRisk.js";
export * from "./environmentalAssessment.js";
export * from "./dealFinancing.js";
export * from "./dealStakeholder.js";
export * from "./propertyTitle.js";
export * from "./propertySurvey.js";
export * from "./financialModel.js";

export const CapitalSourceKindSchema = z.enum([
  "LP_EQUITY",
  "GP_EQUITY",
  "DEBT",
  "MEZZ",
  "PREF_EQUITY",
  "GRANT",
  "OTHER",
]);

export const CapitalSourceCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  sourceKind: CapitalSourceKindSchema,
  amount: z.number().finite().nonnegative(),
  notes: z.string().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const CapitalSourcePatchWithIdInputSchema = CapitalSourceCreateInputSchema.partial().extend({
  id: z.string().uuid(),
});

export const CapitalSourceIdSchema = z.object({
  id: z.string().uuid(),
});

export const EquityWaterfallTierCreateInputSchema = z.object({
  tierName: z.string().min(1).max(120),
  hurdleIrrPct: z.number().finite().min(0).max(100),
  lpDistributionPct: z.number().finite().min(0).max(100),
  gpDistributionPct: z.number().finite().min(0).max(100),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const EquityWaterfallTierPatchWithIdInputSchema =
  EquityWaterfallTierCreateInputSchema.partial().extend({
    id: z.string().uuid(),
  });

export const EquityWaterfallTierIdSchema = z.object({
  id: z.string().uuid(),
});

export type CapitalSourceCreateInput = z.infer<typeof CapitalSourceCreateInputSchema>;
export type CapitalSourcePatchWithIdInput = z.infer<typeof CapitalSourcePatchWithIdInputSchema>;
export type EquityWaterfallTierCreateInput = z.infer<typeof EquityWaterfallTierCreateInputSchema>;
export type EquityWaterfallTierPatchWithIdInput = z.infer<
  typeof EquityWaterfallTierPatchWithIdInputSchema
>;

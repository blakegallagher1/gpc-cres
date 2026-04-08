import { z } from "zod";

export const IntentClassificationSchema = z.object({
  intent: z.enum([
    "underwrite",
    "comp_analysis",
    "lender_compare",
    "rehab_estimate",
    "lender_rate_watch",
    "general",
  ]),
  required_filters: z.record(z.string(), z.unknown()),
  desired_tier_budget: z.object({
    tier0: z.number(),
    tier1: z.number(),
    tier2: z.number(),
  }),
  retrieval_k: z.number(),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

export const DEFAULT_INTENT_CLASSIFICATION: IntentClassification = {
  intent: "general",
  required_filters: {},
  desired_tier_budget: {
    tier0: 300,
    tier1: 700,
    tier2: 300,
  },
  retrieval_k: 10,
};

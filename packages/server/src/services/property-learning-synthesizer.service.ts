import "server-only";

import { createStrictJsonResponse } from "@entitlement-os/openai";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";
import { z } from "zod";

const DEFAULT_PROPERTY_LEARNING_MODEL = "gpt-5.5";
const PROPERTY_LEARNING_PROMPT_CACHE_KEY = "gpc-property-learning-synthesis-v1";

const PropertyLearningSynthesizedCandidateSchema = z.object({
  candidateType: z.enum(["owner", "zoning", "flood_zone", "acreage", "parish", "risk_signal"]),
  statement: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  sourceObservationKeys: z.array(z.string()).min(1),
});

const PropertyLearningSynthesisSchema = z.object({
  propertyKey: z.string().min(1),
  summaryText: z.string().min(1),
  profileFacts: z.record(z.string(), z.unknown()),
  profileSignals: z.record(z.string(), z.unknown()),
  candidates: z.array(PropertyLearningSynthesizedCandidateSchema),
  conflictReview: z.object({
    hasConflict: z.boolean(),
    reasons: z.array(z.string()),
  }),
  promotionRecommendation: z.enum(["promote", "draft", "reject"]),
  confidenceScore: z.number().min(0).max(1),
});

export type PropertyLearningSynthesis = z.infer<typeof PropertyLearningSynthesisSchema>;

export type PropertyLearningSynthesisObservation = {
  observationKey: string;
  observationType: string;
  canonicalAddress: string;
  payloadJson: Record<string, unknown>;
  sourceHash: string;
  observedAt?: string | null;
};

export type SynthesizePropertyLearningProfileInput = {
  orgId: string;
  propertyKey: string;
  observations: PropertyLearningSynthesisObservation[];
  previousResponseId?: string | null;
  model?: string;
};

export type SynthesizePropertyLearningProfileResult = {
  synthesis: PropertyLearningSynthesis;
  responseId: string | null;
};

export async function synthesizePropertyLearningProfile(
  input: SynthesizePropertyLearningProfileInput,
): Promise<SynthesizePropertyLearningProfileResult> {
  const response = await createStrictJsonResponse<PropertyLearningSynthesis>({
    model: input.model ?? process.env.PROPERTY_LEARNING_SYNTHESIS_MODEL ?? DEFAULT_PROPERTY_LEARNING_MODEL,
    input: [
      {
        role: "developer",
        content:
          "You are the GPC property learning synthesizer. Convert durable property observations " +
          "into a concise profile patch and candidate facts. Use only supplied observations, " +
          "preserve sourceObservationKeys for every candidate, and mark conflicts instead of hiding them.",
      },
      {
        role: "user",
        content: JSON.stringify({
          orgId: input.orgId,
          propertyKey: input.propertyKey,
          observations: input.observations.slice(0, 50),
        }),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema(
      "property_learning_synthesis",
      PropertyLearningSynthesisSchema,
    ),
    reasoning: { effort: "high" },
    promptCacheKey: PROPERTY_LEARNING_PROMPT_CACHE_KEY,
    previousResponseId: input.previousResponseId ?? null,
    store: false,
    promptCacheRetention: "24h",
  });

  return {
    synthesis: PropertyLearningSynthesisSchema.parse(response.outputJson),
    responseId: response.responseId,
  };
}

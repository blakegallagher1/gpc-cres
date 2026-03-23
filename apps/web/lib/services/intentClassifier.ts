import "server-only";
import { createStrictJsonResponse } from "@entitlement-os/openai";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";
import {
  IntentClassificationSchema,
  type IntentClassification,
  DEFAULT_INTENT_CLASSIFICATION,
} from "@/lib/schemas/intentClassification";

const INTENT_CLASSIFICATION_MODEL = "gpt-5.4-mini";

const intentClassificationJsonSchema = zodToOpenAiJsonSchema(
  "IntentClassification",
  IntentClassificationSchema,
);

interface EntityContext {
  orgId: string;
  address?: string | null;
  parcelId?: string | null;
  entityId?: string;
}

export async function classifyIntent(
  queryText: string,
  entityContext: EntityContext,
): Promise<IntentClassification> {
  try {
    const response = await createStrictJsonResponse<IntentClassification>({
      model: process.env.INTENT_CLASSIFIER_MODEL ?? INTENT_CLASSIFICATION_MODEL,
      input: [
        {
          role: "system",
          content: [
            "You are an intent classification assistant for a CRE memory system.",
            "Classify user intent into one of: underwrite, comp_analysis, lender_compare, rehab_estimate, lender_rate_watch, general.",
            "Extract structured filters and tier budgets.",
            entityContext.address ? `Property address: ${entityContext.address}` : "",
            entityContext.parcelId ? `Parcel ID: ${entityContext.parcelId}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        {
          role: "user",
          content: queryText,
        },
      ],
      jsonSchema: intentClassificationJsonSchema,
      reasoning: null,
    });

    const parsed = IntentClassificationSchema.safeParse(response.outputJson);
    if (!parsed.success) {
      return DEFAULT_INTENT_CLASSIFICATION;
    }

    return parsed.data;
  } catch {
    return DEFAULT_INTENT_CLASSIFICATION;
  }
}

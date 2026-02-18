import { createStrictJsonResponse } from "@entitlement-os/openai";
import { prisma } from "@entitlement-os/db";
import { zodToOpenAiJsonSchema } from "@entitlement-os/shared";
import { z } from "zod";
import {
  mergeExtractedPreferences,
  type ExtractedPreferenceInput,
} from "@/lib/services/preferenceService";

const PreferenceExtractionSchema = z.object({
  preferences: z.array(
    z.object({
      category: z.enum([
        "DEAL_CRITERIA",
        "FINANCIAL",
        "COMMUNICATION",
        "WORKFLOW",
        "RISK_TOLERANCE",
        "TIMING",
      ]),
      key: z.string().min(1).max(64),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.union([z.string(), z.number(), z.boolean()])),
        z.record(z.string(), z.unknown()),
      ]),
      valueType: z.enum(["NUMBER", "STRING", "ARRAY", "BOOLEAN", "RANGE", "OBJECT"]),
      confidence: z.number().min(0).max(1),
      evidence: z.string().min(1).max(1000),
      isExplicit: z.boolean(),
      messageId: z.string().uuid().optional(),
    }),
  ),
});

type PreferenceExtractionPayload = z.infer<typeof PreferenceExtractionSchema>;

function extractionEnabled(): boolean {
  return (process.env.FEATURE_PREFERENCE_EXTRACTION ?? "").toLowerCase() === "true";
}

function redactEvidenceSnippet(input: string): string {
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]")
    .trim()
    .slice(0, 220);
}

function buildTranscript(messages: Array<{ id: string; content: string }>): string {
  return messages
    .map((message) => `[${message.id}] ${message.content}`)
    .join("\n---\n");
}

async function extractPreferencesFromMessages(
  messages: Array<{ id: string; content: string }>,
): Promise<PreferenceExtractionPayload> {
  const transcript = buildTranscript(messages);

  const response = await createStrictJsonResponse<PreferenceExtractionPayload>({
    model: process.env.PREFERENCE_EXTRACTION_MODEL ?? "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: [
          "You extract user preferences from conversation messages.",
          "Only extract clear and actionable preferences.",
          "Return confidence between 0 and 1.",
          "Use messageId from [messageId] prefixes for evidence traceability.",
          "Be conservative and avoid inventing preferences.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "Extract preferences from these user messages:",
          transcript,
        ].join("\n\n"),
      },
    ],
    jsonSchema: zodToOpenAiJsonSchema("PreferenceExtraction", PreferenceExtractionSchema),
  });

  return PreferenceExtractionSchema.parse(response.outputJson);
}

export async function extractAndMergeConversationPreferences(params: {
  orgId: string;
  userId: string;
  conversationId: string;
}): Promise<void> {
  if (!extractionEnabled()) return;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      orgId: params.orgId,
      userId: params.userId,
    },
    select: {
      id: true,
      messages: {
        where: { role: "user" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
        },
      },
    },
  });

  if (!conversation || conversation.messages.length === 0) return;

  const extracted = await extractPreferencesFromMessages(conversation.messages);
  if (extracted.preferences.length === 0) return;

  const prepared: ExtractedPreferenceInput[] = extracted.preferences.map((pref) => ({
    category: pref.category,
    key: pref.key,
    value: pref.value,
    valueType: pref.valueType,
    confidence: pref.confidence,
    evidence: redactEvidenceSnippet(pref.evidence),
    isExplicit: pref.isExplicit,
    messageId: pref.messageId ?? null,
  }));

  await mergeExtractedPreferences(params.orgId, params.userId, prepared);
}

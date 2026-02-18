import { prisma, type Prisma } from "@entitlement-os/db";

export const PREFERENCE_CONFIDENCE_MIN = 0.4;
export const PREFERENCE_CONTEXT_CONFIDENCE_MIN = 0.6;

export const PREFERENCE_CATEGORIES = [
  "DEAL_CRITERIA",
  "FINANCIAL",
  "COMMUNICATION",
  "WORKFLOW",
  "RISK_TOLERANCE",
  "TIMING",
] as const;

export const PREFERENCE_VALUE_TYPES = [
  "NUMBER",
  "STRING",
  "ARRAY",
  "BOOLEAN",
  "RANGE",
  "OBJECT",
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];
export type PreferenceValueType = (typeof PREFERENCE_VALUE_TYPES)[number];

export type ExtractedPreferenceInput = {
  category: PreferenceCategory;
  key: string;
  value: unknown;
  valueType: PreferenceValueType;
  confidence: number;
  evidence: string;
  isExplicit: boolean;
  messageId?: string | null;
};

function userPreferenceModel() {
  return (prisma as unknown as {
    userPreference?: {
      findUnique: typeof prisma.userPreference.findUnique;
      create: typeof prisma.userPreference.create;
      update: typeof prisma.userPreference.update;
      findMany: typeof prisma.userPreference.findMany;
      findFirst: typeof prisma.userPreference.findFirst;
    };
  }).userPreference;
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function prettyLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatValue(value: unknown, valueType: string): string {
  if (valueType === "RANGE" && Array.isArray(value) && value.length >= 2) {
    return `${String(value[0])} - ${String(value[1])}`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

export async function mergeExtractedPreferences(
  orgId: string,
  userId: string,
  extracted: ExtractedPreferenceInput[],
): Promise<void> {
  if (extracted.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const model = (tx as unknown as {
      userPreference?: {
        findUnique: typeof tx.userPreference.findUnique;
        create: typeof tx.userPreference.create;
        update: typeof tx.userPreference.update;
      };
    }).userPreference;
    if (!model) return;

    for (const pref of extracted) {
      const confidence = clampConfidence(pref.confidence);
      if (confidence < PREFERENCE_CONFIDENCE_MIN) continue;

      const existing = await model.findUnique({
        where: {
          orgId_userId_category_key: {
            orgId,
            userId,
            category: pref.category,
            key: pref.key,
          },
        },
      });

      if (!existing) {
        await model.create({
          data: {
            orgId,
            userId,
            category: pref.category,
            key: pref.key,
            value: toJsonValue(pref.value),
            valueType: pref.valueType,
            confidence,
            sourceCount: 1,
            lastSourceMessageId: pref.messageId ?? null,
            extractedFrom: pref.isExplicit ? "CONVERSATION" : "INFERRED",
            evidenceSnippet: pref.evidence,
            isActive: true,
          },
        });
        continue;
      }

      const shouldUpdate = pref.isExplicit || confidence >= existing.confidence * 0.8;
      if (!shouldUpdate) continue;

      const averagedConfidence = clampConfidence(
        (existing.confidence + confidence) / 2 + (pref.isExplicit ? 0.08 : 0.04),
      );

      await model.update({
        where: { id: existing.id },
        data: {
          value: toJsonValue(pref.value),
          valueType: pref.valueType,
          confidence: averagedConfidence,
          sourceCount: existing.sourceCount + 1,
          lastSourceMessageId: pref.messageId ?? existing.lastSourceMessageId,
          extractedFrom: pref.isExplicit ? "CONVERSATION" : "INFERRED",
          evidenceSnippet: pref.evidence,
          isActive: true,
        },
      });
    }
  });
}

export async function listUserPreferences(orgId: string, userId: string) {
  const model = userPreferenceModel();
  if (!model) return [];

  return model.findMany({
    where: { orgId, userId },
    orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
  });
}

export async function updateUserPreference(params: {
  orgId: string;
  userId: string;
  preferenceId: string;
  confidence?: number;
  isActive?: boolean;
}) {
  const model = userPreferenceModel();
  if (!model) {
    throw new Error("Preference model unavailable");
  }

  const existing = await model.findFirst({
    where: {
      id: params.preferenceId,
      orgId: params.orgId,
      userId: params.userId,
    },
  });

  if (!existing) {
    throw new Error("Preference not found");
  }

  const nextConfidence =
    typeof params.confidence === "number"
      ? clampConfidence(params.confidence)
      : existing.confidence;
  const nextIsActive =
    typeof params.isActive === "boolean" ? params.isActive : existing.isActive;

  return model.update({
    where: { id: existing.id },
    data: {
      confidence: nextConfidence,
      isActive: nextIsActive,
    },
  });
}

export async function getStructuredPreferences(
  orgId: string,
  userId: string,
): Promise<Record<string, unknown>> {
  const model = userPreferenceModel();
  if (!model) return {};

  const prefs = await model.findMany({
    where: {
      orgId,
      userId,
      isActive: true,
      confidence: { gte: PREFERENCE_CONTEXT_CONFIDENCE_MIN },
    },
  });

  const result: Record<string, unknown> = {};
  for (const pref of prefs) {
    result[`${pref.category}.${pref.key}`] = pref.value;
  }
  return result;
}

export async function buildPreferenceContext(
  orgId: string,
  userId: string,
  category?: PreferenceCategory,
): Promise<string> {
  const where: Prisma.UserPreferenceWhereInput = {
    orgId,
    userId,
    isActive: true,
    confidence: { gte: PREFERENCE_CONTEXT_CONFIDENCE_MIN },
  };
  if (category) where.category = category;

  const model = userPreferenceModel();
  if (!model) return "";

  const prefs = await model.findMany({
    where,
    orderBy: [{ category: "asc" }, { confidence: "desc" }],
  });

  if (prefs.length === 0) return "";

  const grouped = new Map<string, string[]>();
  for (const pref of prefs) {
    const bucket = grouped.get(pref.category) ?? [];
    bucket.push(
      `- ${prettyLabel(pref.key)}: ${formatValue(pref.value, pref.valueType)} (confidence ${Math.round(pref.confidence * 100)}%)`,
    );
    grouped.set(pref.category, bucket);
  }

  let output = "Learned user preferences:\n";
  for (const [group, items] of grouped.entries()) {
    output += `\n${prettyLabel(group)}\n${items.join("\n")}\n`;
  }

  return output.trim();
}

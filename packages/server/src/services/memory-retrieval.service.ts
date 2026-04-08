import "server-only";

import { prisma } from "@entitlement-os/db";
import type { Prisma, MemoryVerified } from "@entitlement-os/db";

export interface RetrievalIntentClassification {
  intent:
    | "underwrite"
    | "comp_analysis"
    | "lender_compare"
    | "rehab_estimate"
    | "lender_rate_watch"
    | "general";
  required_filters: Record<string, unknown>;
  desired_tier_budget: {
    tier0: number;
    tier1: number;
    tier2: number;
  };
  retrieval_k: number;
}

interface RetrievalParams {
  entityId: string;
  orgId: string;
  intent: RetrievalIntentClassification;
  queryText: string;
}

export interface ScoredRecord {
  tier: number;
  score: number;
  record: MemoryVerified;
}

interface RetrievalResult {
  tier0Items: ScoredRecord[];
  tier1Items: ScoredRecord[];
  tier2Items: ScoredRecord[];
  totalTokensEstimate: number;
}

const INJECTION_BUDGET = {
  MEMORY_TOKENS: 1500,
  TOTAL_CONTEXT_TOKENS: 2500,
};

const INTENT_FACT_TYPE_FILTER: Record<string, string[]> = {
  lender_compare: ["lender_term"],
  underwrite: ["comp", "tour_observation", "projection"],
  comp_analysis: ["comp", "tour_observation", "projection"],
  general: [],
  lender_rate_watch: [],
  rehab_estimate: [],
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function getFactTypeFilter(intent: RetrievalIntentClassification["intent"]): string[] {
  return INTENT_FACT_TYPE_FILTER[intent] ?? [];
}

function buildRequiredFilters(
  requiredFilters: Record<string, unknown>,
): Prisma.MemoryVerifiedWhereInput | undefined {
  const entries = Object.entries(requiredFilters).filter(
    ([, value]) => value !== null && value !== undefined,
  );

  if (entries.length === 0) {
    return undefined;
  }

  return {
    AND: entries.map(([key, value]) => ({
      payloadJson: {
        path: [key],
        equals: value,
      },
    })),
  } as Prisma.MemoryVerifiedWhereInput;
}

function getRelevanceBonus(record: MemoryVerified, queryText: string): number {
  const payloadText = JSON.stringify(record.payloadJson).toLowerCase();
  const tokens = queryText
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return 0;
  }

  return tokens.some((token) => payloadText.includes(token)) ? 0.5 : 0;
}

function scoreMemory(record: MemoryVerified, queryText: string): number {
  const relevanceBonus = getRelevanceBonus(record, queryText);
  return record.economicWeight * (0.5 + 0.5 * relevanceBonus);
}

function scoreAndSort(records: MemoryVerified[], queryText: string): ScoredRecord[] {
  return records
    .map((record) => ({
      tier: record.tier,
      score: scoreMemory(record, queryText),
      record,
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return right.record.economicWeight - left.record.economicWeight;
    });
}

function itemTokenEstimate(items: ScoredRecord[]): number {
  return estimateTokens(items.map((item) => JSON.stringify(item.record.payloadJson)).join(""));
}

function trimFromTier2(
  tier0Items: ScoredRecord[],
  tier1Items: ScoredRecord[],
  tier2Items: ScoredRecord[],
  totalBudget: number,
) {
  while (itemTokenEstimate([...tier0Items, ...tier1Items, ...tier2Items]) > totalBudget) {
    if (tier2Items.length > 0) {
      tier2Items.pop();
      continue;
    }
    if (tier1Items.length > 0) {
      tier1Items.pop();
      continue;
    }
    if (tier0Items.length > 0) {
      tier0Items.pop();
      continue;
    }
    break;
  }

  return {
    tier0Items,
    tier1Items,
    tier2Items,
  };
}

export async function retrieveMemoryForIntent(
  params: RetrievalParams,
): Promise<RetrievalResult> {
  try {
    const { entityId, orgId, intent, queryText } = params;

    const factTypeFilter = getFactTypeFilter(intent.intent);
    const requiredFilters = buildRequiredFilters(intent.required_filters);

    const [tier0Records, stageARecords] = await Promise.all([
      prisma.memoryVerified.findMany({
        where: { entityId, orgId, tier: 0 },
        orderBy: { createdAt: "desc" },
      }),
      prisma.memoryVerified.findMany({
        where: {
          entityId,
          orgId,
          ...(factTypeFilter.length > 0 ? { factType: { in: factTypeFilter } } : {}),
          ...(requiredFilters ? requiredFilters : {}),
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const tier0Ids = new Set(tier0Records.map((record) => record.id));
    const remaining = stageARecords.filter((record) => !tier0Ids.has(record.id));

    const tier1Candidates = remaining.filter((record) => record.tier <= 1);
    const tier2Candidates = remaining.filter((record) => record.tier > 1);

    const scoredTier0 = scoreAndSort(tier0Records, queryText);
    const scoredTier1 = scoreAndSort(tier1Candidates, queryText);
    const scoredTier2 = scoreAndSort(tier2Candidates, queryText);

    const intentBudget = Math.max(
      0,
      intent.desired_tier_budget.tier0 +
        intent.desired_tier_budget.tier1 +
        intent.desired_tier_budget.tier2,
    );
    const totalBudget = Math.min(INJECTION_BUDGET.TOTAL_CONTEXT_TOKENS, intentBudget);

    const { tier0Items, tier1Items, tier2Items } = trimFromTier2(
      scoredTier0,
      scoredTier1,
      scoredTier2,
      Math.max(totalBudget, INJECTION_BUDGET.MEMORY_TOKENS),
    );

    return {
      tier0Items,
      tier1Items,
      tier2Items,
      totalTokensEstimate: itemTokenEstimate([...tier0Items, ...tier1Items, ...tier2Items]),
    };
  } catch {
    return {
      tier0Items: [],
      tier1Items: [],
      tier2Items: [],
      totalTokensEstimate: 0,
    };
  }
}

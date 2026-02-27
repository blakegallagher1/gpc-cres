import "server-only";

interface ScoringInput {
  similarity: number;
  ageInDays: number;
  sourceWeight: number;
  economicWeight: number;
  volatilityClass: string;
}

const HALF_LIFE_DAYS: Record<string, number> = {
  stable: 730,
  cyclical: 365,
  high_volatility: 180,
};

function recencyDecay(ageInDays: number, volatilityClass: string): number {
  const halfLife = HALF_LIFE_DAYS[volatilityClass] ?? 365;
  const lambda = Math.LN2 / halfLife;
  return Math.exp(-lambda * ageInDays);
}

export function computeRelevanceScore(input: ScoringInput): number {
  const decay = recencyDecay(input.ageInDays, input.volatilityClass);
  return input.similarity * decay * input.sourceWeight * input.economicWeight;
}

export interface ScoredMemory<T> {
  record: T;
  score: number;
}

export function rankMemories<T extends { id: string }>(
  items: Array<{
    record: T;
    similarity: number;
    ageInDays: number;
    sourceWeight: number;
    economicWeight: number;
    volatilityClass: string;
  }>,
  topK: number,
): ScoredMemory<T>[] {
  const scored = items.map((item) => ({
    record: item.record,
    score: computeRelevanceScore({
      similarity: item.similarity,
      ageInDays: item.ageInDays,
      sourceWeight: item.sourceWeight,
      economicWeight: item.economicWeight,
      volatilityClass: item.volatilityClass,
    }),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

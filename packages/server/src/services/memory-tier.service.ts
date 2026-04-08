export type MemoryTier = 0 | 1 | 2 | 3;

const TIER_LABELS: Record<MemoryTier, string> = {
  0: "always-injected",
  1: "intent-based",
  2: "on-demand",
  3: "archive",
};

export function getTierLabel(tier: MemoryTier): string {
  return TIER_LABELS[tier] ?? "unknown";
}

export function assignTier(params: {
  factType: string;
  economicWeight: number;
  volatilityClass: string;
  sourceType: string;
  ageInDays: number;
  payloadSizeChars: number;
}): MemoryTier {
  const { factType, economicWeight, ageInDays, payloadSizeChars } = params;
  if (factType === "correction") return 0;
  if (ageInDays > 365 && economicWeight < 0.3) return 3;
  if (payloadSizeChars > 3000) return 2;
  if (economicWeight >= 0.7 && ageInDays <= 90) return 0;
  if (economicWeight >= 0.4 || ageInDays <= 180) return 1;
  return 2;
}

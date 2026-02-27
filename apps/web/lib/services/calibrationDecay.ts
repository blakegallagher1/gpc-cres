import "server-only";

export const HALF_LIFE_DAYS: Record<string, number> = {
  stable: 730,
  cyclical: 365,
  high_volatility: 180,
};

export function computeEffectiveWeight(
  baseWeight: number,
  ageInDays: number,
  volatilityClass: string,
): number {
  const halfLife = HALF_LIFE_DAYS[volatilityClass] ?? 365;
  const decay = Math.exp((-Math.LN2 * Math.max(ageInDays, 0)) / halfLife);
  return Math.max(0, baseWeight * decay);
}

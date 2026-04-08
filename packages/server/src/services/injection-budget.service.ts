export const INJECTION_BUDGET = {
  MEMORY_TOKENS: 1500,
  TRUTH_SUMMARY_TOKENS: 500,
  TOTAL_CONTEXT_TOKENS: 2500,
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

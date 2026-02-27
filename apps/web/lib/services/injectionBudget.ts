import "server-only";

export const INJECTION_BUDGET = {
  MEMORY_TOKENS: 1500,
  TRUTH_SUMMARY_TOKENS: 500,
  TOTAL_CONTEXT_TOKENS: 2500,
};

/**
 * Estimate token count using ~4 characters per token approximation.
 * This matches OpenAI's GPT-3.5+ tokenizer behavior.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

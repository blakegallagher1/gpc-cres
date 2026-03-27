/**
 * Tool Output Truncation (P2 Pattern 44)
 *
 * Intelligently truncates verbose tool responses that exceed token limits,
 * preserving both head (context) and tail (results) to maintain usability.
 *
 * Rationale:
 * - Large tool outputs can cause token budget overflows in agent loops
 * - Naive truncation loses context and final results
 * - Head-tail preservation maintains queryability and actionability
 * - Human-readable marker shows what was dropped
 */

const MAX_OUTPUT_CHARS = 40_000; // ~10K tokens at 4 chars/token
const PRESERVE_HEAD_CHARS = 20_000;
const PRESERVE_TAIL_CHARS = 20_000;

/**
 * Truncates a string output to max token budget while preserving head and tail.
 * If output exceeds MAX_OUTPUT_CHARS, returns head + marker + tail.
 */
export function truncateToolOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;

  const head = output.slice(0, PRESERVE_HEAD_CHARS);
  const tail = output.slice(-PRESERVE_TAIL_CHARS);
  const dropped = output.length - PRESERVE_HEAD_CHARS - PRESERVE_TAIL_CHARS;

  return `${head}\n\n[… ${dropped.toLocaleString()} characters truncated — use a more specific query for full results …]\n\n${tail}`;
}

/**
 * Truncates JSON output (object or string).
 * Converts objects to JSON string first, then applies truncation.
 */
export function truncateJsonOutput(output: unknown): string {
  const json = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return truncateToolOutput(json);
}

/**
 * Estimates token count using the rule of thumb: 4 characters ≈ 1 token.
 * Useful for quick budget checks without calling tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Checks if text exceeds a token limit.
 * Default limit is 10,000 tokens (40,000 chars).
 */
export function isOverTokenLimit(
  text: string,
  maxTokens: number = 10_000
): boolean {
  return estimateTokens(text) > maxTokens;
}

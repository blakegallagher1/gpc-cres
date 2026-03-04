/**
 * Hosted Tool Quota Enforcement — tracks per-conversation usage of metered
 * hosted tools (web_search_preview, file_search) and rejects calls that
 * exceed the configured limit.
 */

const DEFAULT_WEB_SEARCH_LIMIT = 10;

/** In-memory quota counters keyed by `${conversationId}:${toolName}` */
const quotaCounters = new Map<string, number>();

function getQuotaLimit(toolName: string): number {
  if (toolName === "web_search_preview") {
    const envLimit = process.env.HOSTED_TOOL_WEB_SEARCH_LIMIT;
    return envLimit ? parseInt(envLimit, 10) || DEFAULT_WEB_SEARCH_LIMIT : DEFAULT_WEB_SEARCH_LIMIT;
  }
  // file_search: no limit enforced by default (unlimited)
  return Infinity;
}

function counterKey(conversationId: string, toolName: string): string {
  return `${conversationId}:${toolName}`;
}

/**
 * Check whether a hosted tool call is allowed under quota.
 * Returns `{ allowed: true }` or `{ allowed: false, reason: string }`.
 */
export function checkHostedToolQuota(
  conversationId: string,
  toolName: string,
): { allowed: true } | { allowed: false; reason: string } {
  const limit = getQuotaLimit(toolName);
  if (limit === Infinity) return { allowed: true };

  const key = counterKey(conversationId, toolName);
  const current = quotaCounters.get(key) ?? 0;

  if (current >= limit) {
    return {
      allowed: false,
      reason: `Hosted tool '${toolName}' quota exceeded: ${current}/${limit} calls used in this conversation.`,
    };
  }
  return { allowed: true };
}

/**
 * Increment the usage counter for a hosted tool call.
 * Call this AFTER the tool has been successfully invoked.
 */
export function recordHostedToolUsage(
  conversationId: string,
  toolName: string,
): void {
  const key = counterKey(conversationId, toolName);
  quotaCounters.set(key, (quotaCounters.get(key) ?? 0) + 1);
}

/**
 * Get current usage count for a hosted tool in a conversation.
 */
export function getHostedToolUsage(
  conversationId: string,
  toolName: string,
): number {
  return quotaCounters.get(counterKey(conversationId, toolName)) ?? 0;
}

/**
 * Reset quota counters for a conversation (called on conversation end/cleanup).
 */
export function resetConversationQuota(conversationId: string): void {
  for (const key of quotaCounters.keys()) {
    if (key.startsWith(`${conversationId}:`)) {
      quotaCounters.delete(key);
    }
  }
}

/** Clear all quota counters (for testing). */
export function _resetAllQuotas(): void {
  quotaCounters.clear();
}

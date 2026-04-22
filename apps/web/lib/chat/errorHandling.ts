/**
 * Client-side chat error sanitization utilities.
 *
 * Strips raw internal details (stack traces, API URLs, secrets) from error
 * messages before they reach the UI. Mirrors the server-side sanitizer in
 * apps/web/app/api/chat/_lib/errorHandling.ts but runs in the browser for
 * errors that are composed client-side (e.g. SSE parse failures, fetch errors).
 */

export type SanitizedChatError = {
  message: string;
  correlationId?: string;
};

const MAX_MESSAGE_LENGTH = 200;

/** Patterns whose presence means the entire message is an internal leak. */
const INTERNAL_LEAK_PATTERNS: RegExp[] = [
  /stack trace/i,
  /\bat Module\./,
  /\bat async /,
  /\bat Object\./,
  /prisma/i,
  /findMany/i,
  /public\./,
];

/** Pattern for raw API URLs that should be stripped from messages. */
const URL_PATTERN = /https?:\/\/\S+/gi;

/** Credential / secret patterns — replace entire message on match. */
const SECRET_PATTERNS: RegExp[] = [
  /OPENAI_API_KEY/i,
  /Bearer\s+\S+/i,
  /sk-[a-zA-Z0-9]{20,}/,
];

function stripUrls(message: string): string {
  return message.replace(URL_PATTERN, '[url]');
}

function extractCorrelationId(message: string): string | undefined {
  const match = message.match(/\[(?:corr|correlation|id):\s*([a-zA-Z0-9_-]+)\]/i);
  return match?.[1];
}

function truncate(message: string): string {
  if (message.length <= MAX_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_MESSAGE_LENGTH) + '...';
}

/**
 * Sanitize a raw error string for display in the chat UI.
 *
 * Rules applied in order:
 * 1. Secret credential patterns → generic replacement (correlation ID preserved)
 * 2. Internal stack / Prisma leaks → generic replacement
 * 3. Raw URLs → stripped to `[url]`
 * 4. Truncated to 200 chars
 */
export function sanitizeChatErrorMessage(
  message: string,
  correlationId?: string,
): SanitizedChatError {
  const detectedCorrelationId = correlationId ?? extractCorrelationId(message);

  // Secret patterns — replace entire message, never show raw content
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(message)) {
      return {
        message: 'Something went wrong processing your request.',
        correlationId: detectedCorrelationId,
      };
    }
  }

  // Internal implementation leaks — replace entire message
  for (const pattern of INTERNAL_LEAK_PATTERNS) {
    if (pattern.test(message)) {
      return {
        message: 'Something went wrong processing your request.',
        correlationId: detectedCorrelationId,
      };
    }
  }

  // Strip raw URLs but keep the rest of the message
  const stripped = stripUrls(message);

  return {
    message: truncate(stripped),
    correlationId: detectedCorrelationId,
  };
}

import { createHash } from "node:crypto";

const DEFAULT_SALT = process.env.OPENAI_SAFETY_IDENTIFIER_SALT ?? "entitlement-os";

/**
 * Generate a stable, hashed safety identifier from a user ID.
 * Used as `safety_identifier` in OpenAI Responses API requests
 * (replaces the deprecated `user` parameter).
 */
export function safetyIdentifierFromUser(
  userId: string,
  salt: string = DEFAULT_SALT,
): string {
  return createHash("sha256").update(`${salt}:${userId}`).digest("hex");
}

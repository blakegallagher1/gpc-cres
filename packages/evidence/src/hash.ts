import { hashBytesSha256 } from "@entitlement-os/shared";

/**
 * Hash string or Buffer content for comparison.
 * Normalizes text content (collapse whitespace, trim) before hashing so that
 * insignificant formatting differences don't produce different hashes.
 *
 * For binary content (Uint8Array), hashes the raw bytes without normalization.
 */
export function hashContent(content: string | Uint8Array): string {
  if (typeof content === "string") {
    const normalized = content.replace(/\s+/g, " ").trim();
    return hashBytesSha256(new TextEncoder().encode(normalized));
  }
  return hashBytesSha256(content);
}

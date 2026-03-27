/**
 * Layered description merging with clear precedence (P3 Pattern 6).
 * Priority: runtime override > skill manifest > Zod .describe() > JSDoc
 */
export function mergeDescriptions(sources: {
  jsdoc?: string | null;
  zodDescribe?: string | null;
  skillManifest?: string | null;
  runtimeOverride?: string | null;
}): string | null {
  return (
    sources.runtimeOverride ??
    sources.skillManifest ??
    sources.zodDescribe ??
    sources.jsdoc ??
    null
  );
}

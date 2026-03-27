/**
 * Sort tools alphabetically by name for prompt cache prefix stability.
 * Consistent ordering ensures the tool definition prefix matches across requests,
 * maximizing OpenAI prompt cache hit rates.
 */
export function sortToolsByName<T extends { name?: string; function?: { name?: string } }>(
  tools: T[],
): T[] {
  return [...tools].sort((a, b) => {
    const nameA = a.name ?? a.function?.name ?? "";
    const nameB = b.name ?? b.function?.name ?? "";
    return nameA.localeCompare(nameB);
  });
}

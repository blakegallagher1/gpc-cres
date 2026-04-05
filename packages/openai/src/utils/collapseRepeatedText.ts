/**
 * Normalizes model output where token streaming occasionally duplicates
 * words, hyphen segments, punctuation runs, or glued token pairs.
 * Skips valid JSON payloads so structured outputs are not altered.
 */
export function collapseRepeatedTextArtifacts(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return trimmed;
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    // not JSON — safe to normalize prose
  }

  let normalized = trimmed;

  for (let i = 0; i < 4; i += 1) {
    const next = normalized.replace(/\b([A-Za-z][A-Za-z']{0,40})\s+\1\b/gi, "$1");
    if (next === normalized) break;
    normalized = next;
  }

  for (let i = 0; i < 3; i += 1) {
    const next = normalized.replace(/([-][A-Za-z][A-Za-z']{0,40})\1/gi, "$1");
    if (next === normalized) break;
    normalized = next;
  }

  normalized = normalized.replace(/([:|+*#])\1+/g, "$1");
  normalized = normalized.replace(/(\|\|)\s*\1/g, "$1");

  for (let i = 0; i < 3; i += 1) {
    const next = normalized
      .replace(/\b([A-Z]{4,})\1\b/g, "$1")
      .replace(/([a-z]{4,})\1/g, "$1");
    if (next === normalized) break;
    normalized = next;
  }

  const lines = normalized.split("\n");
  const compactLines: string[] = [];
  for (const line of lines) {
    const prev = compactLines[compactLines.length - 1];
    if (prev && prev.trim() === line.trim()) continue;
    compactLines.push(line);
  }
  return compactLines.join("\n");
}

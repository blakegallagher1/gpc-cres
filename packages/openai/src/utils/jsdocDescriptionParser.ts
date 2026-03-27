/**
 * Extracts tool descriptions from JSDoc comments (P2 Pattern 14).
 * Parses @description and @param tags from JSDoc blocks.
 */

export type ParsedJsDoc = {
  description: string | null;
  params: Record<string, string>;
};

/**
 * Extract the JSDoc block immediately preceding a function/export.
 */
export function extractJsDocBlock(source: string, functionName: string): string | null {
  // Match /** ... */ block before the function name
  const pattern = new RegExp(
    `/\\*\\*([\\s\\S]*?)\\*/\\s*(?:export\\s+)?(?:async\\s+)?(?:const|function)\\s+${functionName}`,
  );
  const match = source.match(pattern);
  if (!match || !match[1]) return null;
  return match[1];
}

/**
 * Parse a JSDoc comment block into structured description and params.
 */
export function parseJsDoc(block: string): ParsedJsDoc {
  const lines = block
    .split("\n")
    .map((line) => line.replace(/^\s*\*\s?/, "").trim())
    .filter((line) => line.length > 0);

  let description: string | null = null;
  const params: Record<string, string> = {};
  const descLines: string[] = [];
  let inDescription = true;

  for (const line of lines) {
    if (line.startsWith("@description ")) {
      descLines.push(line.slice("@description ".length));
      inDescription = true;
      continue;
    }
    if (line.startsWith("@param")) {
      inDescription = false;
      // @param {type} name - description  OR  @param name - description
      const paramMatch = line.match(/@param\s+(?:\{[^}]*\}\s+)?(\w+)\s*[-–—]?\s*(.*)/);
      if (paramMatch && paramMatch[1]) {
        params[paramMatch[1]] = paramMatch[2]?.trim() ?? "";
      }
      continue;
    }
    if (line.startsWith("@")) {
      inDescription = false;
      continue;
    }
    if (inDescription) {
      descLines.push(line);
    }
  }

  if (descLines.length > 0) {
    description = descLines.join(" ").trim();
  }

  return { description, params };
}

/**
 * Extract and parse JSDoc for a named function from source code.
 */
export function extractFunctionDoc(source: string, functionName: string): ParsedJsDoc {
  const block = extractJsDocBlock(source, functionName);
  if (!block) return { description: null, params: {} };
  return parseJsDoc(block);
}

/**
 * Truncate a description to a maximum length for tool definitions.
 */
export function truncateDescription(description: string, maxLength: number = 512): string {
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength - 3) + "...";
}

/**
 * CLI helper to run unified retrieval from command line.
 */

import { unifiedRetrieval } from "../services/retrieval.service";
import { logger } from "../utils/logger";
import { fileURLToPath } from "node:url";

/**
 * Execute a retrieval and print top matches.
 */
export async function runRetrieval(
  query: string,
  subjectId?: string,
): Promise<void> {
  const safeQuery = query?.trim();
  if (!safeQuery) {
    throw new Error("query is required");
  }

  const results = await unifiedRetrieval(safeQuery, subjectId);
  logger.info("runRetrieval", {
    queryHash: hashString(safeQuery),
    resultCount: results.length,
  });

  for (const [index, item] of results.entries()) {
    console.log(
      JSON.stringify({
        rank: index + 1,
        source: item.source,
        score: Number(item.score.toFixed(4)),
        text: item.text,
        confidence: Number(item.confidence.toFixed(4)),
        recencyScore: Number(item.recencyScore.toFixed(4)),
      }),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const query = process.argv[2];
  const subjectId = process.argv[3];
  runRetrieval(query, subjectId)
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error("runRetrieval failed", { error: String(error) });
      process.exit(1);
    });
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash)}`;
}

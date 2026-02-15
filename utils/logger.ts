/**
 * Structured logger and retrieval telemetry counters used across services.
 */

export type RetrievalSource = "semantic" | "sparse" | "graph";

type RetrievalCounter = {
  totalQueries: number;
  totalReturned: number;
  sourceHits: Record<RetrievalSource, number>;
};

const retrievalStats: RetrievalCounter = {
  totalQueries: 0,
  totalReturned: 0,
  sourceHits: {
    semantic: 0,
    sparse: 0,
    graph: 0,
  },
};

/**
 * Minimal, dependency-free structured logger that writes to stdout/stderr.
 */
export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(formatEvent("debug", message, context));
  },
  info(message: string, context?: Record<string, unknown>): void {
    console.info(formatEvent("info", message, context));
  },
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(formatEvent("warn", message, context));
  },
  error(message: string, context?: Record<string, unknown>): void {
    console.error(formatEvent("error", message, context));
  },
};

/**
 * Log a retrieval run and record source counts to make observability queries easy.
 */
export function recordRetrievalRun(payload: {
  query: string;
  resultCount: number;
  sources: Partial<Record<RetrievalSource, number>>;
}): void {
  retrievalStats.totalQueries += 1;
  retrievalStats.totalReturned += payload.resultCount;

  for (const source of Object.keys(payload.sources) as RetrievalSource[]) {
    retrievalStats.sourceHits[source] += payload.sources[source] ?? 0;
  }

  logger.info("Retrieval executed", {
    queryHash: hashString(payload.query),
    resultCount: payload.resultCount,
    sources: payload.sources,
  });
}

/**
 * Returns current retrieval counters for dashboards and tests.
 */
export function getRetrievalMetrics(): RetrievalCounter {
  return {
    totalQueries: retrievalStats.totalQueries,
    totalReturned: retrievalStats.totalReturned,
    sourceHits: {
      semantic: retrievalStats.sourceHits.semantic,
      sparse: retrievalStats.sourceHits.sparse,
      graph: retrievalStats.sourceHits.graph,
    },
  };
}

/**
 * Reset counters in local environments, smoke tests, or unit tests.
 */
export function resetRetrievalMetrics(): void {
  retrievalStats.totalQueries = 0;
  retrievalStats.totalReturned = 0;
  retrievalStats.sourceHits.semantic = 0;
  retrievalStats.sourceHits.sparse = 0;
  retrievalStats.sourceHits.graph = 0;
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash)}`;
}

function formatEvent(
  level: "debug" | "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>,
): string {
  const event = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(event);
}

/**
 * Structured logger and retrieval telemetry counters used across services.
 */
export type RetrievalSource = "semantic" | "sparse" | "graph";
type RetrievalCounter = {
    totalQueries: number;
    totalReturned: number;
    sourceHits: Record<RetrievalSource, number>;
};
type AutoFeedTelemetryPayload = {
    runId: string;
    episodeId: string | null;
    vectorMode: "embedded" | "missing-input" | "error";
    kgEventsInserted: number;
    temporalEdgesInserted: number;
    rewardScore: number | null;
    status: "started" | "succeeded" | "failed" | "validation_error";
    hasWarnings: boolean;
};
/**
 * Minimal, dependency-free structured logger that writes to stdout/stderr.
 */
export declare const logger: {
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
};
/**
 * Log a retrieval run and record source counts to make observability queries easy.
 */
export declare function recordRetrievalRun(payload: {
    query: string;
    resultCount: number;
    sources: Partial<Record<RetrievalSource, number>>;
}): void;
/**
 * Returns current retrieval counters for dashboards and tests.
 */
export declare function getRetrievalMetrics(): RetrievalCounter;
/**
 * Reset counters in local environments, smoke tests, or unit tests.
 */
export declare function resetRetrievalMetrics(): void;
/**
 * Emit structured auto-feed observability and forward event data to shared
 * Data Agent counters so DA-005 coverage can be tracked centrally.
 */
export declare function recordDataAgentAutoFeed(payload: AutoFeedTelemetryPayload): void;
export {};
//# sourceMappingURL=logger.d.ts.map
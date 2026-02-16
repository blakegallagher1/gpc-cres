"use strict";
/**
 * Structured logger and retrieval telemetry counters used across services.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.recordRetrievalRun = recordRetrievalRun;
exports.getRetrievalMetrics = getRetrievalMetrics;
exports.resetRetrievalMetrics = resetRetrievalMetrics;
exports.recordDataAgentAutoFeed = recordDataAgentAutoFeed;
const node_module_1 = require("node:module");
const requireModule = (0, node_module_1.createRequire)(import.meta.url);
const sharedTelemetry = loadSharedTelemetry();
const retrievalStats = {
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
exports.logger = {
    debug(message, context) {
        console.debug(formatEvent("debug", message, context));
    },
    info(message, context) {
        console.info(formatEvent("info", message, context));
    },
    warn(message, context) {
        console.warn(formatEvent("warn", message, context));
    },
    error(message, context) {
        console.error(formatEvent("error", message, context));
    },
};
/**
 * Log a retrieval run and record source counts to make observability queries easy.
 */
function recordRetrievalRun(payload) {
    retrievalStats.totalQueries += 1;
    retrievalStats.totalReturned += payload.resultCount;
    for (const source of Object.keys(payload.sources)) {
        retrievalStats.sourceHits[source] += payload.sources[source] ?? 0;
    }
    exports.logger.info("Retrieval executed", {
        queryHash: hashString(payload.query),
        resultCount: payload.resultCount,
        sources: payload.sources,
    });
}
/**
 * Returns current retrieval counters for dashboards and tests.
 */
function getRetrievalMetrics() {
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
function resetRetrievalMetrics() {
    retrievalStats.totalQueries = 0;
    retrievalStats.totalReturned = 0;
    retrievalStats.sourceHits.semantic = 0;
    retrievalStats.sourceHits.sparse = 0;
    retrievalStats.sourceHits.graph = 0;
}
/**
 * Emit structured auto-feed observability and forward event data to shared
 * Data Agent counters so DA-005 coverage can be tracked centrally.
 */
function recordDataAgentAutoFeed(payload) {
    sharedTelemetry.recordDataAgentAutoFeed?.(payload);
    if (payload.status === "succeeded") {
        exports.logger.info("Data Agent auto-feed succeeded", {
            runId: payload.runId,
            episodeId: payload.episodeId,
            vectorMode: payload.vectorMode,
            kgEventsInserted: payload.kgEventsInserted,
            temporalEdgesInserted: payload.temporalEdgesInserted,
            rewardScore: payload.rewardScore,
            status: payload.status,
        });
        return;
    }
    exports.logger.warn("Data Agent auto-feed issue", {
        runId: payload.runId,
        episodeId: payload.episodeId,
        vectorMode: payload.vectorMode,
        status: payload.status,
        hasWarnings: payload.hasWarnings,
        rewardScore: payload.rewardScore,
    });
}
function loadSharedTelemetry() {
    try {
        const sharedTelemetry = requireModule("@entitlement-os/shared");
        if (sharedTelemetry &&
            typeof sharedTelemetry.recordDataAgentAutoFeed === "function") {
            return {
                recordDataAgentAutoFeed: sharedTelemetry.recordDataAgentAutoFeed,
            };
        }
    }
    catch {
        // no-op fallback when shared workspace packages are unavailable in this runtime
    }
    return {};
}
function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return `${Math.abs(hash)}`;
}
function formatEvent(level, message, context) {
    const event = {
        ts: new Date().toISOString(),
        level,
        message,
        ...context,
    };
    return JSON.stringify(event);
}
//# sourceMappingURL=logger.js.map
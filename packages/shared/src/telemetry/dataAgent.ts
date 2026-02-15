/**
 * Shared in-memory counters and structured snapshots for Data Agent observability.
 */

export type DataAgentRetrievalMetric = {
  query: string;
  resultCount: number;
  sources: {
    semantic: number;
    sparse: number;
    graph: number;
  };
  topScore: number | null;
  hasSubjectScope: boolean;
  generatedAt: string;
};

export type DataAgentAutoFeedEvent = {
  runId: string;
  episodeId: string | null;
  vectorMode: "embedded" | "missing-input" | "error";
  kgEventsInserted: number;
  temporalEdgesInserted: number;
  rewardScore: number | null;
  status: "started" | "succeeded" | "failed" | "validation_error";
  hasWarnings: boolean;
  generatedAt: string;
};

export type DataAgentRewardEvent = {
  episodeId: string;
  userScore: number;
  autoScore: number;
  generatedAt: string;
};

type DataAgentMetrics = {
  retrieval: {
    calls: number;
    averageReturned: number;
    sourceTotals: {
      semantic: number;
      sparse: number;
      graph: number;
    };
    lastRuns: DataAgentRetrievalMetric[];
  };
  autoFeed: {
    attempts: number;
    successes: number;
    failures: number;
    validationFailures: number;
    episodesCreated: number;
    vectorEmbeddings: number;
    kgEventsInserted: number;
    temporalEdgesInserted: number;
    lastRuns: DataAgentAutoFeedEvent[];
  };
  rewards: {
    writes: number;
    lastRuns: DataAgentRewardEvent[];
  };
};

const metrics: DataAgentMetrics = {
  retrieval: {
    calls: 0,
    averageReturned: 0,
    sourceTotals: {
      semantic: 0,
      sparse: 0,
      graph: 0,
    },
    lastRuns: [],
  },
  autoFeed: {
    attempts: 0,
    successes: 0,
    failures: 0,
    validationFailures: 0,
    episodesCreated: 0,
    vectorEmbeddings: 0,
    kgEventsInserted: 0,
    temporalEdgesInserted: 0,
    lastRuns: [],
  },
  rewards: {
    writes: 0,
    lastRuns: [],
  },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function addLast<T>(list: T[], value: T, maxSize = 30): T[] {
  const updated = [value, ...list];
  if (updated.length <= maxSize) {
    return updated;
  }
  return updated.slice(0, maxSize);
}

export function recordDataAgentRetrieval(payload: {
  query: string;
  resultCount: number;
  sources: {
    semantic: number;
    sparse: number;
    graph: number;
  };
  topScore?: number | null;
  hasSubjectScope?: boolean;
}): void {
  metrics.retrieval.calls += 1;
  metrics.retrieval.sourceTotals.semantic += Math.max(0, payload.sources.semantic);
  metrics.retrieval.sourceTotals.sparse += Math.max(0, payload.sources.sparse);
  metrics.retrieval.sourceTotals.graph += Math.max(0, payload.sources.graph);
  metrics.retrieval.averageReturned = metrics.retrieval.calls === 0
    ? 0
    : (metrics.retrieval.averageReturned * (metrics.retrieval.calls - 1) + payload.resultCount) /
      metrics.retrieval.calls;

  metrics.retrieval.lastRuns = addLast(metrics.retrieval.lastRuns, {
    query: payload.query,
    resultCount: Math.max(0, payload.resultCount),
    sources: {
      semantic: Math.max(0, payload.sources.semantic),
      sparse: Math.max(0, payload.sources.sparse),
      graph: Math.max(0, payload.sources.graph),
    },
    topScore: typeof payload.topScore === "number" ? clamp01(payload.topScore) : null,
    hasSubjectScope: payload.hasSubjectScope ?? false,
    generatedAt: new Date().toISOString(),
  });
}

export function recordDataAgentAutoFeed(payload: Omit<
  DataAgentAutoFeedEvent,
  "generatedAt"
>): void {
  metrics.autoFeed.attempts += 1;
  metrics.autoFeed.vectorEmbeddings +=
    payload.vectorMode === "embedded" ? 1 : 0;
  metrics.autoFeed.kgEventsInserted += Math.max(0, payload.kgEventsInserted);
  metrics.autoFeed.temporalEdgesInserted += Math.max(0, payload.temporalEdgesInserted);

  if (payload.status === "validation_error") {
    metrics.autoFeed.validationFailures += 1;
    metrics.autoFeed.failures += 1;
  } else if (payload.status === "succeeded") {
    metrics.autoFeed.successes += 1;
  } else if (payload.status === "failed") {
    metrics.autoFeed.failures += 1;
  }

  if (payload.episodeId) {
    metrics.autoFeed.episodesCreated += 1;
  }

  metrics.autoFeed.lastRuns = addLast(metrics.autoFeed.lastRuns, {
    ...payload,
    generatedAt: new Date().toISOString(),
  });
}

export function recordDataAgentReward(payload: {
  episodeId: string;
  userScore: number;
  autoScore: number;
}): void {
  metrics.rewards.writes += 1;
  metrics.rewards.lastRuns = addLast(metrics.rewards.lastRuns, {
    episodeId: payload.episodeId,
    userScore: payload.userScore,
    autoScore: payload.autoScore,
    generatedAt: new Date().toISOString(),
  });
}

export function getDataAgentMetrics(): DataAgentMetrics {
  return JSON.parse(JSON.stringify(metrics)) as DataAgentMetrics;
}

export function resetDataAgentMetrics(): void {
  metrics.retrieval.calls = 0;
  metrics.retrieval.averageReturned = 0;
  metrics.retrieval.sourceTotals.semantic = 0;
  metrics.retrieval.sourceTotals.sparse = 0;
  metrics.retrieval.sourceTotals.graph = 0;
  metrics.retrieval.lastRuns = [];

  metrics.autoFeed.attempts = 0;
  metrics.autoFeed.successes = 0;
  metrics.autoFeed.failures = 0;
  metrics.autoFeed.validationFailures = 0;
  metrics.autoFeed.episodesCreated = 0;
  metrics.autoFeed.vectorEmbeddings = 0;
  metrics.autoFeed.kgEventsInserted = 0;
  metrics.autoFeed.temporalEdgesInserted = 0;
  metrics.autoFeed.lastRuns = [];

  metrics.rewards.writes = 0;
  metrics.rewards.lastRuns = [];
}

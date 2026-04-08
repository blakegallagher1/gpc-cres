import { beforeEach, describe, expect, it, vi } from "vitest";

const { searchKnowledgeBaseMock } = vi.hoisted(() => ({
  searchKnowledgeBaseMock: vi.fn(),
}));

async function loadModule(options?: {
  injectEpisodes?: boolean;
  injectProcedures?: boolean;
  maxSimilarEpisodes?: number;
  maxProcedures?: number;
}) {
  vi.resetModules();

  vi.doMock("@gpc/server/search/knowledge-base.service", () => ({
    searchKnowledgeBase: searchKnowledgeBaseMock,
  }));

  vi.doMock("@gpc/server/automation/config", () => ({
    AUTOMATION_CONFIG: {
      agentLearning: {
        injectEpisodes: options?.injectEpisodes ?? true,
        injectProcedures: options?.injectProcedures ?? false,
        maxSimilarEpisodes: options?.maxSimilarEpisodes ?? 2,
        maxProcedures: options?.maxProcedures ?? 2,
      },
    },
  }));

  return import("../learningContextBuilder");
}

describe("buildLearningContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty block when no results are found", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([]);
    const { buildLearningContext } = await loadModule();

    const result = await buildLearningContext({
      orgId: "org-1",
      userId: "user-1",
      userMessage: "Find similar zoning wins.",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runTypeHint: "TRIAGE",
    });

    expect(result).toEqual({
      contextBlock: "",
      episodeResults: [],
      procedureResults: [],
    });
  });

  it("reranks same-deal episodes above generic matches", async () => {
    searchKnowledgeBaseMock.mockResolvedValue([
      {
        id: "episode-generic",
        contentText: "Generic success summary",
        metadata: {
          taskType: "TRIAGE",
          outcome: "SUCCESS",
          confidence: 0.7,
          dealId: "deal-other",
        },
        similarity: 0.92,
      },
      {
        id: "episode-same-deal",
        contentText: "Same deal summary",
        metadata: {
          taskType: "TRIAGE",
          outcome: "SUCCESS",
          confidence: 0.81,
          dealId: "deal-1",
        },
        similarity: 0.7,
      },
    ]);
    const { buildLearningContext } = await loadModule();

    const result = await buildLearningContext({
      orgId: "org-1",
      userId: "user-1",
      userMessage: "Find similar zoning wins.",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runTypeHint: "TRIAGE",
    });

    expect(result.episodeResults[0]?.id).toBe("episode-same-deal");
    expect(result.contextBlock).toContain("[Similar Prior Runs]");
    expect(result.contextBlock).toContain("task=TRIAGE");
  });

  it("includes procedures only when procedure injection is enabled", async () => {
    searchKnowledgeBaseMock
      .mockResolvedValueOnce([
        {
          id: "episode-1",
          contentText: "Episode summary",
          metadata: {
            taskType: "TRIAGE",
            outcome: "SUCCESS",
            confidence: 0.82,
          },
          similarity: 0.8,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "skill-1",
          contentText: "Procedure body",
          metadata: {
            name: "Triage Research procedure",
            description: "Use the knowledge base before synthesis.",
            successRate: 0.8,
            toolSequence: ["search_knowledge_base", "screenZoning"],
          },
          similarity: 0.79,
        },
      ]);
    const { buildLearningContext } = await loadModule({
      injectProcedures: true,
    });

    const result = await buildLearningContext({
      orgId: "org-1",
      userId: "user-1",
      userMessage: "Find similar zoning wins.",
      dealId: "deal-1",
      jurisdictionId: "jurisdiction-1",
      runTypeHint: "TRIAGE",
    });

    expect(searchKnowledgeBaseMock).toHaveBeenCalledTimes(2);
    expect(result.procedureResults).toHaveLength(1);
    expect(result.contextBlock).toContain("[Relevant Procedures]");
    expect(result.contextBlock).toContain("sequence=search_knowledge_base -> screenZoning");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "AGENTOS_ENABLED",
  "AGENTOS_QDRANT_HYBRID_ENABLED",
  "AGENTOS_CONTEXT_MANAGEMENT_ENABLED",
  "AGENTOS_EPISODIC_MEMORY_ENABLED",
  "AGENTOS_SEMANTIC_MEMORY_ENABLED",
  "AGENTOS_PROCEDURAL_MEMORY_ENABLED",
  "AGENTOS_DOMAIN_MEMORY_ENABLED",
  "AGENTOS_CRITIC_ENABLED",
  "AGENTOS_REFLECTION_ENABLED",
  "AGENTOS_TRAJECTORY_ENABLED",
  "AGENTOS_POLICY_ENGINE_ENABLED",
  "AGENTOS_SELF_REPAIR_ENABLED",
  "AGENTOS_EVAL_HARNESS_ENABLED",
  "AGENTOS_COST_TRACKING_ENABLED",
  "AGENTOS_AGENT_MODEL",
  "AGENTOS_REASONING_EFFORT",
  "AGENTOS_REASONING_EFFORT_CRITIC",
  "AGENTOS_REASONING_EFFORT_REFLECTION",
  "OPENAI_EMBEDDING_MODEL",
  "OPENAI_EMBEDDING_DIMENSIONS",
  "AGENTOS_COMPACTION_THRESHOLD",
  "AGENTOS_CONTEXT_BUDGET_EPISODIC",
  "AGENTOS_CONTEXT_BUDGET_HARD_CAP",
  "AGENTOS_QDRANT_COLLECTION_EPISODIC",
  "AGENTOS_QDRANT_COLLECTION_SKILLS",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];
const originalEnv: Partial<Record<EnvKey, string>> = {};
for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key];
}

describe("agentos config", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const original = originalEnv[key];
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("uses safe defaults with AgentOS disabled", async () => {
    const { getAgentOsConfig, isAgentOsFeatureEnabled } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.enabled).toBe(false);
    expect(config.models.agent).toBe("gpt-5.2");
    expect(config.models.embedding).toBe("pplx-embed-v1-4b");
    expect(config.models.embeddingDimensions).toBe(2560);
    expect(config.models.reasoningEffort).toBe("low");
    expect(config.models.reasoningEffortCritic).toBe("high");
    expect(config.models.reasoningEffortReflection).toBe("low");
    expect(isAgentOsFeatureEnabled("qdrantHybridRetrieval")).toBe(false);
    expect(isAgentOsFeatureEnabled("episodicMemory")).toBe(false);
    expect(isAgentOsFeatureEnabled("criticEvaluation")).toBe(false);
  });

  it("returns correct default budgets and thresholds", async () => {
    const { getAgentOsConfig } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.contextBudgets.episodic).toBe(2000);
    expect(config.contextBudgets.skills).toBe(1500);
    expect(config.contextBudgets.domain).toBe(2000);
    expect(config.contextBudgets.semantic).toBe(1000);
    expect(config.contextBudgets.hardCap).toBe(12000);
    expect(config.contextManagement.compactionThreshold).toBe(100_000);
  });

  it("returns correct default Qdrant collection names", async () => {
    const { getAgentOsConfig } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.qdrant.collections.episodicMemory).toBe("episodic_memory");
    expect(config.qdrant.collections.skillTriggers).toBe("skill_triggers");
    expect(config.qdrant.collections.domainDocs).toBe("domain_docs");
    expect(config.qdrant.collections.toolSpecs).toBe("tool_specs");
  });

  it("enables selected features when explicit flags are on", async () => {
    process.env.AGENTOS_ENABLED = "true";
    process.env.AGENTOS_QDRANT_HYBRID_ENABLED = "1";
    process.env.AGENTOS_CONTEXT_MANAGEMENT_ENABLED = "true";
    process.env.AGENTOS_EPISODIC_MEMORY_ENABLED = "yes";
    process.env.AGENTOS_CRITIC_ENABLED = "on";

    const { getAgentOsConfig, isAgentOsFeatureEnabled } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.enabled).toBe(true);
    expect(isAgentOsFeatureEnabled("qdrantHybridRetrieval")).toBe(true);
    expect(isAgentOsFeatureEnabled("contextManagementCompaction")).toBe(true);
    expect(isAgentOsFeatureEnabled("episodicMemory")).toBe(true);
    expect(isAgentOsFeatureEnabled("criticEvaluation")).toBe(true);
    expect(isAgentOsFeatureEnabled("semanticMemory")).toBe(false);
  });

  it("reads custom budgets and reasoning efforts from env", async () => {
    process.env.AGENTOS_CONTEXT_BUDGET_EPISODIC = "3000";
    process.env.AGENTOS_CONTEXT_BUDGET_HARD_CAP = "20000";
    process.env.AGENTOS_COMPACTION_THRESHOLD = "50000";
    process.env.AGENTOS_REASONING_EFFORT = "medium";
    process.env.AGENTOS_REASONING_EFFORT_CRITIC = "low";
    process.env.AGENTOS_REASONING_EFFORT_REFLECTION = "medium";

    const { getAgentOsConfig } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.contextBudgets.episodic).toBe(3000);
    expect(config.contextBudgets.hardCap).toBe(20000);
    expect(config.contextManagement.compactionThreshold).toBe(50000);
    expect(config.models.reasoningEffort).toBe("medium");
    expect(config.models.reasoningEffortCritic).toBe("low");
    expect(config.models.reasoningEffortReflection).toBe("medium");
  });

  it("reads custom Qdrant collection names from env", async () => {
    process.env.AGENTOS_QDRANT_COLLECTION_EPISODIC = "my_episodes";
    process.env.AGENTOS_QDRANT_COLLECTION_SKILLS = "my_skills";

    const { getAgentOsConfig } = await import("./config.js");
    const config = getAgentOsConfig({ refresh: true });

    expect(config.qdrant.collections.episodicMemory).toBe("my_episodes");
    expect(config.qdrant.collections.skillTriggers).toBe("my_skills");
    expect(config.qdrant.collections.domainDocs).toBe("domain_docs");
  });
});

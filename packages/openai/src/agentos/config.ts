export type AgentOsReasoningEffort = "low" | "medium" | "high";

export type AgentOsFeatureName =
  // Memory tiers
  | "episodicMemory"
  | "semanticMemory"
  | "proceduralMemory"
  | "domainMemory"
  // Context engineering
  | "contextManagementCompaction"
  | "toolOutputTrimming"
  // Vector retrieval
  | "qdrantHybridRetrieval"
  // Post-run pipeline
  | "reflection"
  | "criticEvaluation"
  | "skillDistillation"
  | "trajectoryCapture"
  // Tool orchestration
  | "policyEngine"
  | "selfRepair"
  | "dynamicToolRegistry"
  // Cost / eval
  | "costTracking"
  | "evalHarness";

export type AgentOsFeatureFlags = Record<AgentOsFeatureName, boolean>;

export type QdrantCollectionConfig = {
  episodicMemory: string;
  skillTriggers: string;
  domainDocs: string;
  toolSpecs: string;
  institutionalKnowledge: string;
  propertyIntelligence: string;
};

export type ContextManagementType = "compaction";

export type AgentOsContextManagementConfig = {
  type: ContextManagementType;
  compactionThreshold: number;
};

export type AgentOsConfig = {
  enabled: boolean;
  features: AgentOsFeatureFlags;
  models: {
    agent: string;
    critic: string;
    embedding: string;
    embeddingDimensions: number;
    reasoningEffort: AgentOsReasoningEffort;
    reasoningEffortCritic: AgentOsReasoningEffort;
    reasoningEffortReflection: AgentOsReasoningEffort;
  };
  contextManagement: AgentOsContextManagementConfig;
  qdrant: {
    url: string | null;
    apiKey: string | null;
    collections: QdrantCollectionConfig;
    denseVectorName: string;
    sparseVectorName: string;
  };
  toolOutputTrimmer: {
    maxDepth: number;
    maxObjectKeys: number;
    maxArrayItems: number;
    maxStringLength: number;
    maxSerializedLength: number;
  };
  contextBudgets: {
    episodic: number;
    skills: number;
    domain: number;
    semantic: number;
    hardCap: number;
  };
};

let cachedConfig: AgentOsConfig | null = null;

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function readNumber(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function readReasoningEffort(name: string, fallback: AgentOsReasoningEffort): AgentOsReasoningEffort {
  const raw = process.env[name];
  if (!raw) return fallback;
  if (raw === "low" || raw === "medium" || raw === "high") {
    return raw;
  }
  return fallback;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function buildConfig(): AgentOsConfig {
  const enabled = readBoolean("AGENTOS_ENABLED", false);

  const features: AgentOsFeatureFlags = {
    episodicMemory: readBoolean("AGENTOS_EPISODIC_MEMORY_ENABLED", false),
    semanticMemory: readBoolean("AGENTOS_SEMANTIC_MEMORY_ENABLED", false),
    proceduralMemory: readBoolean("AGENTOS_PROCEDURAL_MEMORY_ENABLED", false),
    domainMemory: readBoolean("AGENTOS_DOMAIN_MEMORY_ENABLED", false),
    contextManagementCompaction: readBoolean("AGENTOS_CONTEXT_MANAGEMENT_ENABLED", false),
    toolOutputTrimming: readBoolean("AGENTOS_TOOL_OUTPUT_TRIMMER_ENABLED", false),
    qdrantHybridRetrieval: readBoolean("AGENTOS_QDRANT_HYBRID_ENABLED", false),
    reflection: readBoolean("AGENTOS_REFLECTION_ENABLED", false),
    criticEvaluation: readBoolean("AGENTOS_CRITIC_ENABLED", false),
    skillDistillation: readBoolean("AGENTOS_SKILL_DISTILLATION_ENABLED", false),
    trajectoryCapture: readBoolean("AGENTOS_TRAJECTORY_ENABLED", false),
    policyEngine: readBoolean("AGENTOS_POLICY_ENGINE_ENABLED", false),
    selfRepair: readBoolean("AGENTOS_SELF_REPAIR_ENABLED", false),
    dynamicToolRegistry: readBoolean("AGENTOS_DYNAMIC_TOOL_REGISTRY_ENABLED", false),
    costTracking: readBoolean("AGENTOS_COST_TRACKING_ENABLED", false),
    evalHarness: readBoolean("AGENTOS_EVAL_HARNESS_ENABLED", false),
  };

  return {
    enabled,
    features,
    models: {
      agent: process.env.AGENTOS_AGENT_MODEL?.trim() || "gpt-5.2",
      critic: process.env.AGENTOS_CRITIC_MODEL?.trim() || "gpt-5.2",
      embedding: process.env.OPENAI_EMBEDDING_MODEL?.trim() || "pplx-embed-v1-4b",
      embeddingDimensions: readNumber("OPENAI_EMBEDDING_DIMENSIONS", 2560, 1),
      reasoningEffort: readReasoningEffort("AGENTOS_REASONING_EFFORT", "low"),
      reasoningEffortCritic: readReasoningEffort("AGENTOS_REASONING_EFFORT_CRITIC", "high"),
      reasoningEffortReflection: readReasoningEffort("AGENTOS_REASONING_EFFORT_REFLECTION", "low"),
    },
    contextManagement: {
      type: "compaction",
      compactionThreshold: readNumber("AGENTOS_COMPACTION_THRESHOLD", 100_000, 1000),
    },
    qdrant: {
      url: normalizeUrl(process.env.QDRANT_URL),
      apiKey: process.env.QDRANT_API_KEY?.trim() || null,
      collections: {
        episodicMemory:
          process.env.AGENTOS_QDRANT_COLLECTION_EPISODIC?.trim() || "episodic_memory",
        skillTriggers:
          process.env.AGENTOS_QDRANT_COLLECTION_SKILLS?.trim() || "skill_triggers",
        domainDocs:
          process.env.AGENTOS_QDRANT_COLLECTION_DOMAIN?.trim() || "domain_docs",
        toolSpecs:
          process.env.AGENTOS_QDRANT_COLLECTION_TOOLS?.trim() || "tool_specs",
        institutionalKnowledge:
          process.env.AGENTOS_QDRANT_COLLECTION_INSTITUTIONAL_KNOWLEDGE?.trim() ||
          "institutional_knowledge",
        propertyIntelligence:
          process.env.AGENTOS_QDRANT_COLLECTION_PROPERTY_INTELLIGENCE?.trim() || "property_intelligence",
      },
      denseVectorName: process.env.AGENTOS_QDRANT_DENSE_VECTOR_NAME?.trim() || "dense",
      sparseVectorName: process.env.AGENTOS_QDRANT_SPARSE_VECTOR_NAME?.trim() || "bm25",
    },
    toolOutputTrimmer: {
      maxDepth: readNumber("AGENTOS_TOOL_OUTPUT_MAX_DEPTH", 6, 1),
      maxObjectKeys: readNumber("AGENTOS_TOOL_OUTPUT_MAX_OBJECT_KEYS", 48, 1),
      maxArrayItems: readNumber("AGENTOS_TOOL_OUTPUT_MAX_ARRAY_ITEMS", 40, 1),
      maxStringLength: readNumber("AGENTOS_TOOL_OUTPUT_MAX_STRING_LENGTH", 2400, 32),
      maxSerializedLength: readNumber(
        "AGENTOS_TOOL_OUTPUT_MAX_SERIALIZED_LENGTH",
        16_000,
        512,
      ),
    },
    contextBudgets: {
      episodic: readNumber("AGENTOS_CONTEXT_BUDGET_EPISODIC", 2000, 100),
      skills: readNumber("AGENTOS_CONTEXT_BUDGET_SKILLS", 1500, 100),
      domain: readNumber("AGENTOS_CONTEXT_BUDGET_DOMAIN", 2000, 100),
      semantic: readNumber("AGENTOS_CONTEXT_BUDGET_SEMANTIC", 1000, 100),
      hardCap: readNumber("AGENTOS_CONTEXT_BUDGET_HARD_CAP", 12000, 500),
    },
  };
}

export function getAgentOsConfig(options?: { refresh?: boolean }): AgentOsConfig {
  if (!cachedConfig || options?.refresh) {
    cachedConfig = buildConfig();
  }
  return cachedConfig;
}

export function isAgentOsFeatureEnabled(feature: AgentOsFeatureName): boolean {
  const config = getAgentOsConfig();
  return config.enabled && config.features[feature];
}

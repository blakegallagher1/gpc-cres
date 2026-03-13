import { z } from "zod";
import { ToolOrgIdSchema } from "../tools/orgIdSchema.js";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

export const OutcomeEnum = z.enum(["success", "failure", "partial"]);
export type Outcome = z.infer<typeof OutcomeEnum>;

export const RiskLevelEnum = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelEnum>;

export const DomainSourceTypeEnum = z.enum([
  "zoning_code",
  "market_report",
  "internal_memo",
  "schema_doc",
]);
export type DomainSourceType = z.infer<typeof DomainSourceTypeEnum>;

// ---------------------------------------------------------------------------
// EpisodicEntry
// ---------------------------------------------------------------------------

export const EpisodicEntrySchema = z.object({
  id: z.string().uuid(),
  summary: z.string(),
  embeddingId: z.string(),
  outcome: OutcomeEnum,
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()),
  agentId: z.string(),
  taskType: z.string(),
  orgId: ToolOrgIdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type EpisodicEntry = z.infer<typeof EpisodicEntrySchema>;

// ---------------------------------------------------------------------------
// SemanticFact
// ---------------------------------------------------------------------------

export const SemanticFactSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  valueJson: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1),
  provenanceEpisodeId: z.string().uuid().nullable(),
  orgId: ToolOrgIdSchema,
  updatedAt: z.coerce.date(),
});
export type SemanticFact = z.infer<typeof SemanticFactSchema>;

// ---------------------------------------------------------------------------
// ProceduralSkill
// ---------------------------------------------------------------------------

export const ProceduralSkillSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  skillMdContent: z.string(),
  toolSequence: z.array(z.string()),
  successCount: z.number().int().min(0),
  failCount: z.number().int().min(0),
  successRate: z.number().min(0).max(1),
  evaluatorAvgScore: z.number().min(0).max(1),
  dedupeHash: z.string(),
  embeddingId: z.string(),
  orgId: ToolOrgIdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ProceduralSkill = z.infer<typeof ProceduralSkillSchema>;

// ---------------------------------------------------------------------------
// DomainDoc
// ---------------------------------------------------------------------------

export const DomainDocSchema = z.object({
  id: z.string().uuid(),
  sourceType: DomainSourceTypeEnum,
  title: z.string(),
  summary: z.string(),
  contentPointer: z.string(),
  embeddingId: z.string(),
  tags: z.array(z.string()),
  orgId: ToolOrgIdSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DomainDoc = z.infer<typeof DomainDocSchema>;

// ---------------------------------------------------------------------------
// TrajectoryLog — tool call sub-schema
// ---------------------------------------------------------------------------

export const ToolCallEntrySchema = z.object({
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()),
  latencyMs: z.number().int().min(0),
  success: z.boolean(),
  retryCount: z.number().int().min(0),
});
export type ToolCallEntry = z.infer<typeof ToolCallEntrySchema>;

export const TokenUsageSchema = z.object({
  input: z.number().int().min(0),
  output: z.number().int().min(0),
  reasoning: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const RiskEventSchema = z.object({
  type: z.string(),
  detail: z.string(),
  severity: RiskLevelEnum,
  timestamp: z.coerce.date(),
});
export type RiskEvent = z.infer<typeof RiskEventSchema>;

export const ReflectionSchema = z.object({
  summary: z.string(),
  lessonsLearned: z.array(z.string()),
  suggestedImprovements: z.array(z.string()),
});
export type Reflection = z.infer<typeof ReflectionSchema>;

export const TrajectoryLogSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  agentId: z.string(),
  taskInput: z.string(),
  retrievedContextSummary: z.record(z.string(), z.unknown()),
  plan: z.string().nullable(),
  toolCalls: z.array(ToolCallEntrySchema),
  intermediateSteps: z.record(z.string(), z.unknown()),
  finalOutput: z.string(),
  reflection: ReflectionSchema.nullable(),
  evaluatorScore: z.number().min(0).max(1).nullable(),
  latencyMs: z.number().int().min(0),
  tokenUsage: TokenUsageSchema,
  costUsd: z.number().min(0),
  riskEvents: z.array(RiskEventSchema),
  orgId: ToolOrgIdSchema,
  createdAt: z.coerce.date(),
});
export type TrajectoryLog = z.infer<typeof TrajectoryLogSchema>;

// ---------------------------------------------------------------------------
// ToolSpec
// ---------------------------------------------------------------------------

export const RetryPolicySchema = z.object({
  maxRetries: z.number().int().min(0),
  initialDelayMs: z.number().int().min(0),
  maxDelayMs: z.number().int().min(0),
  multiplier: z.number().min(1),
});
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

export const LatencyStatsSchema = z.object({
  p50Ms: z.number().min(0),
  p95Ms: z.number().min(0),
  p99Ms: z.number().min(0),
  avgMs: z.number().min(0),
});
export type LatencyStats = z.infer<typeof LatencyStatsSchema>;

export const CostStatsSchema = z.object({
  avgCostUsd: z.number().min(0),
  totalCostUsd: z.number().min(0),
  invokeCount: z.number().int().min(0),
});
export type CostStats = z.infer<typeof CostStatsSchema>;

export const ToolSpecSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  inputSchemaJson: z.record(z.string(), z.unknown()),
  outputSchemaJson: z.record(z.string(), z.unknown()),
  riskLevel: RiskLevelEnum,
  retryPolicy: RetryPolicySchema,
  permissionScope: z.string(),
  costStats: CostStatsSchema,
  latencyStats: LatencyStatsSchema,
  errorRate: z.number().min(0).max(1),
  embeddingId: z.string(),
  orgId: ToolOrgIdSchema,
});
export type ToolSpec = z.infer<typeof ToolSpecSchema>;

// ---------------------------------------------------------------------------
// EvalResult
// ---------------------------------------------------------------------------

export const EvalDimensionScoresSchema = z.record(z.string(), z.number().min(0).max(1));
export type EvalDimensionScores = z.infer<typeof EvalDimensionScoresSchema>;

export const EvalResultSchema = z.object({
  id: z.string().uuid(),
  trajectoryLogId: z.string().uuid(),
  dimensionScores: EvalDimensionScoresSchema,
  overallScore: z.number().min(0).max(1),
  rationale: z.string(),
  orgId: ToolOrgIdSchema,
  createdAt: z.coerce.date(),
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

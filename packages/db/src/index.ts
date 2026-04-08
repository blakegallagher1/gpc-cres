export { prisma, prismaRead } from "./client.js";
export { getDataAgentSchemaCapabilities } from "./schemaCapabilities.js";
export { Prisma } from "@prisma/client";
export type { DataAgentSchemaCapabilities } from "./schemaCapabilities.js";
export * from "./json.js";
export * from "./errors.js";
export * from "./repositories/run.repository.js";
export * from "./repositories/deal.repository.js";
export * from "./repositories/proactive-action.repository.js";
export * from "./repositories/task.repository.js";
export * from "./repositories/memory.repository.js";

// Re-export Prisma types for downstream packages (e.g. evidence) without requiring
// them to depend on @prisma/client directly.
export type { PrismaClient } from "@prisma/client";
export type {
  Org,
  User,
  OrgMembership,
  Jurisdiction,
  JurisdictionSeedSource,
  Deal,
  Parcel,
  Task,
  Buyer,
  Outreach,
  Run,
  EvidenceSource,
  EvidenceSnapshot,
  ParishPackVersion,
  Artifact,
  Upload,
  Conversation,
  Tenant,
  TenantLease,
  DevelopmentBudget,
  Message,
  EpisodicEntry,
  SemanticFact,
  ProceduralSkill,
  DomainDoc,
  TrajectoryLog,
  ToolSpec,
  EvalResult,
  InternalEntity,
  MemoryEventLog,
  MemorySourceRegistry,
  MemoryDraft,
  MemoryVerified,
  MemoryRejected,
} from "@prisma/client";

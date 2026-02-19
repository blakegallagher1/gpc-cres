export { prisma, prismaRead } from "./client.js";

// Re-export Prisma types for downstream packages (e.g. evidence) without requiring
// them to depend on @prisma/client directly.
export type { PrismaClient } from "@prisma/client";
export type { Prisma } from "@prisma/client";
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
} from "@prisma/client";

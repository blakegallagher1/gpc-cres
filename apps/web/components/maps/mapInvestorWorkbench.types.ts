import { z } from "zod";

const RESOURCE_KIND_VALUES = ["loading", "ready", "empty", "fallback"] as const;

const ResourceKindSchema = z.enum(RESOURCE_KIND_VALUES);
const ResourceSourceSchema = z.enum(["api", "fallback", "empty"]);

const ResourceStatusSchema = z.object({
  kind: ResourceKindSchema,
  source: ResourceSourceSchema,
  title: z.string(),
  detail: z.string(),
});

const WorkspaceSnapshotSchema = z.object({
  status: ResourceStatusSchema,
  recordId: z.string().nullable(),
  name: z.string(),
  selectedCount: z.number(),
  trackedCount: z.number(),
  geofenceCount: z.number(),
  noteCount: z.number(),
  taskCount: z.number(),
  compCount: z.number(),
  aiInsightCount: z.number(),
  lastUpdatedLabel: z.string(),
});

const OwnerGroupSchema = z.object({
  ownerName: z.string(),
  parcelCount: z.number(),
  combinedAcreage: z.number().nullable(),
});

const AssemblageCandidateSchema = z.object({
  id: z.string(),
  label: z.string(),
  parcelIds: z.array(z.string()),
  parcelCount: z.number(),
  combinedAcreage: z.number().nullable(),
  frontageFeet: z.number().nullable(),
  ownerCount: z.number(),
  holdoutRisk: z.enum(["low", "medium", "high"]),
  rationale: z.array(z.string()),
});

const AssemblageSnapshotSchema = z.object({
  status: ResourceStatusSchema,
  adjacencyEdgeCount: z.number(),
  ownerGroups: z.array(OwnerGroupSchema),
  bestCandidate: AssemblageCandidateSchema.nullable(),
  candidates: z.array(AssemblageCandidateSchema),
});

const OutreachContactSchema = z.object({
  id: z.string(),
  label: z.string(),
  outcome: z.string(),
  nextAction: z.string(),
});

const OwnershipRollupSchema = z.object({
  ownerName: z.string(),
  parcelCount: z.number(),
  combinedAcreage: z.number().nullable(),
  mailingAddress: z.string().nullable(),
  portfolioContext: z.string().nullable(),
});

const OwnershipSnapshotSchema = z.object({
  status: ResourceStatusSchema,
  ownerRollup: z.array(OwnershipRollupSchema),
  brokerNotes: z.array(z.string()),
  contactLog: z.array(OutreachContactSchema),
  nextContactTask: z.string().nullable(),
  skipTraceStatus: z.enum(["available", "pending", "unavailable"]),
});

const CompAdjustmentSchema = z.object({
  label: z.string(),
  value: z.string(),
});

const CompRowSchema = z.object({
  id: z.string(),
  address: z.string(),
  landUse: z.string(),
  distanceLabel: z.string(),
  saleDateLabel: z.string(),
  weightingLabel: z.string(),
  priceLabel: z.string(),
  adjustedPriceLabel: z.string(),
});

const CompsSnapshotSchema = z.object({
  status: ResourceStatusSchema,
  filterSummary: z.array(z.string()),
  underwritingSummary: z.array(z.string()),
  adjustments: z.array(CompAdjustmentSchema),
  rows: z.array(CompRowSchema),
});

const OverlayCardSchema = z.object({
  id: z.string(),
  label: z.string(),
  availability: z.enum(["live", "fallback", "unavailable"]),
  detail: z.string(),
  active: z.boolean(),
});

const MarketOverlaySnapshotSchema = z.object({
  status: ResourceStatusSchema,
  cards: z.array(OverlayCardSchema),
});

export type MapWorkbenchResourceKind = z.infer<typeof ResourceKindSchema>;
export type MapWorkbenchResourceStatus = z.infer<typeof ResourceStatusSchema>;
export type MapWorkspaceSnapshot = z.infer<typeof WorkspaceSnapshotSchema>;
export type MapAssemblageSnapshot = z.infer<typeof AssemblageSnapshotSchema>;
export type MapOwnershipSnapshot = z.infer<typeof OwnershipSnapshotSchema>;
export type MapCompsSnapshot = z.infer<typeof CompsSnapshotSchema>;
export type MapMarketOverlaySnapshot = z.infer<typeof MarketOverlaySnapshotSchema>;

export type MapInvestorWorkbench = {
  workspace: MapWorkspaceSnapshot;
  assemblage: MapAssemblageSnapshot;
  ownership: MapOwnershipSnapshot;
  comps: MapCompsSnapshot;
  marketOverlays: MapMarketOverlaySnapshot;
};

export {
  AssemblageSnapshotSchema,
  CompsSnapshotSchema,
  MarketOverlaySnapshotSchema,
  OwnershipSnapshotSchema,
  ResourceStatusSchema,
  WorkspaceSnapshotSchema,
};

import { prisma } from "@entitlement-os/db";
import {
  computeEntitlementPathPredictions,
  hashJsonSha256,
  type EntitlementStrategyPrediction,
} from "@entitlement-os/shared";

type SkuType = "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";

type DecisionType =
  | "approved"
  | "approved_with_conditions"
  | "denied"
  | "withdrawn";

export interface UpsertEntitlementGraphNodeInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  nodeType: string;
  nodeKey: string;
  label: string;
  attributes?: Record<string, unknown>;
  confidence?: number | null;
  active?: boolean | null;
}

export interface UpsertEntitlementGraphEdgeInput {
  orgId: string;
  jurisdictionId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  weight?: number | null;
  metadata?: Record<string, unknown>;
}

export interface UpsertEntitlementOutcomePrecedentInput {
  orgId: string;
  jurisdictionId: string;
  precedentKey: string;
  strategyKey: string;
  strategyLabel: string;
  decision: DecisionType;
  dealId?: string | null;
  strategyNodeId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  hearingBody?: string | null;
  submittedAt?: string | null;
  decisionAt?: string | null;
  timelineDays?: number | null;
  conditions?: unknown[];
  riskFlags?: string[];
  sourceEvidenceIds?: string[];
  sourceSnapshotIds?: string[];
  confidence?: number | null;
  notes?: string | null;
  createdBy?: string | null;
}

export interface PredictEntitlementStrategiesInput {
  orgId: string;
  jurisdictionId: string;
  dealId?: string | null;
  sku?: SkuType | null;
  applicationType?: string | null;
  lookbackMonths?: number | null;
  minSampleSize?: number | null;
  includeBelowMinSample?: boolean | null;
  persistSnapshots?: boolean | null;
  modelVersion?: string | null;
}

export interface EntitlementGraphReadInput {
  orgId: string;
  jurisdictionId: string;
  nodeTypes?: string[] | null;
  includeInactive?: boolean | null;
  limit?: number | null;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function deriveTimelineDays(
  timelineDays: number | null | undefined,
  submittedAt: Date | null,
  decisionAt: Date | null,
): number | null {
  if (typeof timelineDays === "number" && Number.isFinite(timelineDays) && timelineDays > 0) {
    return Math.round(timelineDays);
  }
  if (!submittedAt || !decisionAt) {
    return null;
  }
  const diffMs = decisionAt.getTime() - submittedAt.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 86_400_000);
}

async function assertJurisdictionScope(orgId: string, jurisdictionId: string): Promise<void> {
  const jurisdiction = await prisma.jurisdiction.findFirst({
    where: { id: jurisdictionId, orgId },
    select: { id: true },
  });
  if (!jurisdiction) {
    throw new Error("Jurisdiction not found or access denied.");
  }
}

async function assertDealScope(
  orgId: string,
  dealId: string | null | undefined,
  jurisdictionId?: string,
): Promise<void> {
  if (!dealId) return;
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId },
    select: { jurisdictionId: true },
  });
  if (!deal) {
    throw new Error("Deal not found or access denied.");
  }
  if (jurisdictionId && deal.jurisdictionId !== jurisdictionId) {
    throw new Error("Deal does not belong to the provided jurisdiction.");
  }
}

export async function upsertEntitlementGraphNode(
  input: UpsertEntitlementGraphNodeInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const node = await prisma.entitlementGraphNode.upsert({
    where: {
      orgId_jurisdictionId_nodeType_nodeKey: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        nodeType: input.nodeType,
        nodeKey: input.nodeKey,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      dealId: input.dealId ?? null,
      nodeType: input.nodeType,
      nodeKey: input.nodeKey,
      label: input.label,
      attributes: (input.attributes ?? {}) as object,
      confidence: input.confidence ?? 0.7,
      active: input.active ?? true,
    },
    update: {
      dealId: input.dealId ?? undefined,
      label: input.label,
      attributes: (input.attributes ?? {}) as object,
      confidence: input.confidence ?? undefined,
      active: input.active ?? undefined,
    },
  });

  return {
    id: node.id,
    nodeType: node.nodeType,
    nodeKey: node.nodeKey,
    label: node.label,
    confidence: Number(node.confidence),
    active: node.active,
  };
}

export async function upsertEntitlementGraphEdge(
  input: UpsertEntitlementGraphEdgeInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);

  const connectedNodes = await prisma.entitlementGraphNode.findMany({
    where: {
      id: { in: [input.fromNodeId, input.toNodeId] },
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
    },
    select: { id: true },
  });
  if (connectedNodes.length !== 2) {
    throw new Error("Both edge nodes must exist in the same org and jurisdiction.");
  }

  const edge = await prisma.entitlementGraphEdge.upsert({
    where: {
      orgId_jurisdictionId_fromNodeId_toNodeId_edgeType: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        edgeType: input.edgeType,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      fromNodeId: input.fromNodeId,
      toNodeId: input.toNodeId,
      edgeType: input.edgeType,
      weight: input.weight ?? 1,
      metadata: (input.metadata ?? {}) as object,
    },
    update: {
      weight: input.weight ?? undefined,
      metadata: (input.metadata ?? {}) as object,
    },
  });

  return {
    id: edge.id,
    edgeType: edge.edgeType,
    weight: Number(edge.weight),
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
  };
}

export async function upsertEntitlementOutcomePrecedent(
  input: UpsertEntitlementOutcomePrecedentInput,
) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  let strategyNodeId = input.strategyNodeId ?? null;
  if (!strategyNodeId) {
    const strategyNode = await prisma.entitlementGraphNode.upsert({
      where: {
        orgId_jurisdictionId_nodeType_nodeKey: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          nodeType: "strategy_path",
          nodeKey: input.strategyKey,
        },
      },
      create: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        dealId: input.dealId ?? null,
        nodeType: "strategy_path",
        nodeKey: input.strategyKey,
        label: input.strategyLabel,
        attributes: {} as object,
        confidence: input.confidence ?? 0.7,
        active: true,
      },
      update: {
        label: input.strategyLabel,
        confidence: input.confidence ?? undefined,
      },
      select: { id: true },
    });
    strategyNodeId = strategyNode.id;
  }

  const submittedAt = parseDate(input.submittedAt);
  const decisionAt = parseDate(input.decisionAt);
  const timelineDays = deriveTimelineDays(input.timelineDays, submittedAt, decisionAt);

  const precedent = await prisma.entitlementOutcomePrecedent.upsert({
    where: {
      orgId_jurisdictionId_precedentKey: {
        orgId: input.orgId,
        jurisdictionId: input.jurisdictionId,
        precedentKey: input.precedentKey,
      },
    },
    create: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      dealId: input.dealId ?? null,
      strategyNodeId,
      precedentKey: input.precedentKey,
      strategyKey: input.strategyKey,
      strategyLabel: input.strategyLabel,
      sku: input.sku ?? null,
      applicationType: input.applicationType ?? null,
      hearingBody: input.hearingBody ?? null,
      submittedAt,
      decisionAt,
      decision: input.decision,
      timelineDays,
      conditions: (input.conditions ?? []) as object,
      riskFlags: input.riskFlags ?? [],
      sourceEvidenceIds: input.sourceEvidenceIds ?? [],
      sourceSnapshotIds: input.sourceSnapshotIds ?? [],
      confidence: input.confidence ?? 0.7,
      notes: input.notes ?? null,
      createdBy: input.createdBy ?? null,
    },
    update: {
      dealId: input.dealId ?? undefined,
      strategyNodeId,
      strategyKey: input.strategyKey,
      strategyLabel: input.strategyLabel,
      sku: input.sku ?? undefined,
      applicationType: input.applicationType ?? undefined,
      hearingBody: input.hearingBody ?? undefined,
      submittedAt: submittedAt ?? undefined,
      decisionAt: decisionAt ?? undefined,
      decision: input.decision,
      timelineDays: timelineDays ?? undefined,
      conditions: (input.conditions ?? []) as object,
      riskFlags: input.riskFlags ?? [],
      sourceEvidenceIds: input.sourceEvidenceIds ?? [],
      sourceSnapshotIds: input.sourceSnapshotIds ?? [],
      confidence: input.confidence ?? undefined,
      notes: input.notes ?? undefined,
      createdBy: input.createdBy ?? undefined,
    },
  });

  return {
    id: precedent.id,
    precedentKey: precedent.precedentKey,
    strategyKey: precedent.strategyKey,
    strategyLabel: precedent.strategyLabel,
    decision: precedent.decision,
    timelineDays: precedent.timelineDays,
    confidence: Number(precedent.confidence),
  };
}

export async function predictEntitlementStrategies(
  input: PredictEntitlementStrategiesInput,
): Promise<{
  modelVersion: string;
  jurisdictionId: string;
  totalPrecedents: number;
  strategyCount: number;
  inputHash: string;
  predictions: Array<EntitlementStrategyPrediction & { snapshotId: string | null }>;
}> {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);
  await assertDealScope(input.orgId, input.dealId, input.jurisdictionId);

  const lookbackMonths = Math.max(1, input.lookbackMonths ?? 36);
  const minSampleSize = Math.max(1, input.minSampleSize ?? 1);
  const includeBelowMinSample = input.includeBelowMinSample ?? true;
  const persistSnapshots = input.persistSnapshots ?? true;
  const modelVersion = input.modelVersion ?? "entitlement_graph_v1";

  const since = new Date();
  since.setMonth(since.getMonth() - lookbackMonths);

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(input.dealId ? { dealId: input.dealId } : {}),
      ...(input.sku ? { sku: input.sku } : {}),
      ...(input.applicationType ? { applicationType: input.applicationType } : {}),
      decisionAt: { gte: since },
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  const inputHash = hashJsonSha256({
    jurisdictionId: input.jurisdictionId,
    dealId: input.dealId ?? null,
    sku: input.sku ?? null,
    applicationType: input.applicationType ?? null,
    lookbackMonths,
    minSampleSize,
    includeBelowMinSample,
    modelVersion,
    precedentFingerprint: precedents.map((precedent) => ({
      id: precedent.id,
      updatedAt: precedent.updatedAt.toISOString(),
    })),
  });

  const predictions = computeEntitlementPathPredictions(
    precedents.map((precedent) => ({
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: precedent.decision,
      timelineDays: precedent.timelineDays,
      submittedAt: precedent.submittedAt,
      decisionAt: precedent.decisionAt,
      confidence: Number(precedent.confidence),
      riskFlags: precedent.riskFlags,
    })),
    {
      minSampleSize,
      includeBelowMinSample,
      modelVersion,
    },
  );

  const snapshotIdByStrategy = new Map<string, string>();
  if (persistSnapshots) {
    for (const prediction of predictions) {
      const snapshot = await prisma.entitlementPredictionSnapshot.upsert({
        where: {
          orgId_jurisdictionId_strategyKey_inputHash: {
            orgId: input.orgId,
            jurisdictionId: input.jurisdictionId,
            strategyKey: prediction.strategyKey,
            inputHash,
          },
        },
        create: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          dealId: input.dealId ?? null,
          strategyKey: prediction.strategyKey,
          strategyLabel: prediction.strategyLabel,
          sku: input.sku ?? null,
          probabilityApproval: prediction.probabilityApproval,
          probabilityLow: prediction.probabilityLow,
          probabilityHigh: prediction.probabilityHigh,
          expectedDaysP50: prediction.expectedDaysP50,
          expectedDaysP75: prediction.expectedDaysP75,
          expectedDaysP90: prediction.expectedDaysP90,
          sampleSize: prediction.sampleSize,
          modelVersion,
          inputHash,
          rationale: prediction.rationale as object,
        },
        update: {
          dealId: input.dealId ?? undefined,
          strategyLabel: prediction.strategyLabel,
          sku: input.sku ?? undefined,
          probabilityApproval: prediction.probabilityApproval,
          probabilityLow: prediction.probabilityLow,
          probabilityHigh: prediction.probabilityHigh,
          expectedDaysP50: prediction.expectedDaysP50,
          expectedDaysP75: prediction.expectedDaysP75,
          expectedDaysP90: prediction.expectedDaysP90,
          sampleSize: prediction.sampleSize,
          modelVersion,
          rationale: prediction.rationale as object,
        },
      });

      snapshotIdByStrategy.set(prediction.strategyKey, snapshot.id);
    }
  }

  return {
    modelVersion,
    jurisdictionId: input.jurisdictionId,
    totalPrecedents: precedents.length,
    strategyCount: predictions.length,
    inputHash,
    predictions: predictions.map((prediction) => ({
      ...prediction,
      snapshotId: snapshotIdByStrategy.get(prediction.strategyKey) ?? null,
    })),
  };
}

export async function getEntitlementGraph(input: EntitlementGraphReadInput) {
  await assertJurisdictionScope(input.orgId, input.jurisdictionId);

  const limit = Math.max(1, Math.min(500, input.limit ?? 250));
  const includeInactive = input.includeInactive ?? false;

  const nodes = await prisma.entitlementGraphNode.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
      ...(includeInactive ? {} : { active: true }),
      ...(input.nodeTypes && input.nodeTypes.length > 0
        ? { nodeType: { in: input.nodeTypes } }
        : {}),
    },
    orderBy: [
      { nodeType: "asc" },
      { nodeKey: "asc" },
    ],
    take: limit,
  });

  const nodeIds = nodes.map((node) => node.id);
  const edges = nodeIds.length === 0
    ? []
    : await prisma.entitlementGraphEdge.findMany({
        where: {
          orgId: input.orgId,
          jurisdictionId: input.jurisdictionId,
          OR: [
            { fromNodeId: { in: nodeIds } },
            { toNodeId: { in: nodeIds } },
          ],
        },
        orderBy: [
          { edgeType: "asc" },
          { createdAt: "desc" },
        ],
      });

  const precedents = await prisma.entitlementOutcomePrecedent.findMany({
    where: {
      orgId: input.orgId,
      jurisdictionId: input.jurisdictionId,
    },
    orderBy: [
      { decisionAt: "desc" },
      { createdAt: "desc" },
    ],
    take: 200,
  });

  return {
    jurisdictionId: input.jurisdictionId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    precedentCount: precedents.length,
    nodes: nodes.map((node) => ({
      id: node.id,
      nodeType: node.nodeType,
      nodeKey: node.nodeKey,
      label: node.label,
      attributes: node.attributes as Record<string, unknown>,
      confidence: Number(node.confidence),
      active: node.active,
      dealId: node.dealId,
      createdAt: node.createdAt.toISOString(),
      updatedAt: node.updatedAt.toISOString(),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      edgeType: edge.edgeType,
      weight: Number(edge.weight),
      metadata: edge.metadata as Record<string, unknown>,
      createdAt: edge.createdAt.toISOString(),
      updatedAt: edge.updatedAt.toISOString(),
    })),
    precedents: precedents.map((precedent) => ({
      id: precedent.id,
      precedentKey: precedent.precedentKey,
      strategyKey: precedent.strategyKey,
      strategyLabel: precedent.strategyLabel,
      decision: precedent.decision,
      timelineDays: precedent.timelineDays,
      decisionAt: precedent.decisionAt ? precedent.decisionAt.toISOString().slice(0, 10) : null,
      confidence: Number(precedent.confidence),
      riskFlags: precedent.riskFlags,
    })),
  };
}

import { prisma, type Prisma } from "../index.js";
import type {
  DealAssetClass,
  DealStageKey,
  DealStatus,
  DealStrategy,
  OpportunityKind,
  SkuType,
  WorkflowTemplateKey,
} from "@entitlement-os/shared";

export const LEGACY_SKU_MAP: Record<
  SkuType,
  {
    assetClass: DealAssetClass;
    strategy: DealStrategy;
    workflowTemplateKey: WorkflowTemplateKey;
  }
> = {
  SMALL_BAY_FLEX: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
  OUTDOOR_STORAGE: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
  TRUCK_PARKING: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
};

export const LEGACY_STATUS_STAGE_MAP: Record<DealStatus, DealStageKey> = {
  INTAKE: "ORIGINATION",
  TRIAGE_DONE: "SCREENING",
  PREAPP: "UNDERWRITING",
  CONCEPT: "UNDERWRITING",
  NEIGHBORS: "DUE_DILIGENCE",
  SUBMITTED: "EXECUTION",
  HEARING: "EXECUTION",
  APPROVED: "EXECUTION",
  EXIT_MARKETED: "DISPOSITION",
  EXITED: "CLOSED_WON",
  KILLED: "CLOSED_LOST",
};

export const dealReaderSelect = {
  id: true,
  orgId: true,
  name: true,
  jurisdictionId: true,
  sku: true,
  status: true,
  assetClass: true,
  strategy: true,
  opportunityKind: true,
  workflowTemplateKey: true,
  currentStageKey: true,
  legacySku: true,
  legacyStatus: true,
  primaryAssetId: true,
  createdAt: true,
  updatedAt: true,
  primaryAsset: {
    select: {
      id: true,
      name: true,
      address: true,
      parcelNumber: true,
      assetClass: true,
    },
  },
} satisfies Prisma.DealSelect;

type DealReaderRow = Prisma.DealGetPayload<{ select: typeof dealReaderSelect }>;

export type DealReaderRecord = {
  id: string;
  orgId: string;
  name: string;
  jurisdictionId: string;
  sku: SkuType;
  status: DealStatus;
  assetClass: DealAssetClass | null;
  strategy: DealStrategy | null;
  opportunityKind: OpportunityKind | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
  currentStageKey: DealStageKey | null;
  legacySku: SkuType;
  legacyStatus: DealStatus;
  primaryAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  primaryAsset: {
    id: string;
    name: string;
    address: string | null;
    parcelNumber: string | null;
    assetClass: DealAssetClass | null;
  } | null;
};

export function resolveFromLegacySku(
  sku: SkuType | null | undefined,
): {
  assetClass: DealAssetClass | null;
  strategy: DealStrategy | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
} {
  if (!sku) {
    return {
      assetClass: null,
      strategy: null,
      workflowTemplateKey: null,
    };
  }

  return LEGACY_SKU_MAP[sku];
}

export function resolveCurrentStageKey(
  currentStageKey: DealStageKey | null,
  status: DealStatus,
): DealStageKey {
  return currentStageKey ?? LEGACY_STATUS_STAGE_MAP[status];
}

export function normalizeDealReaderRow(row: DealReaderRow): DealReaderRecord {
  const legacySku = row.legacySku ?? row.sku;
  const legacyStatus = row.legacyStatus ?? row.status;
  const fallback = resolveFromLegacySku(legacySku);

  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    jurisdictionId: row.jurisdictionId,
    sku: row.sku as SkuType,
    status: row.status as DealStatus,
    assetClass: row.assetClass ?? fallback.assetClass,
    strategy: row.strategy ?? fallback.strategy,
    opportunityKind: row.opportunityKind as OpportunityKind | null,
    workflowTemplateKey: row.workflowTemplateKey ?? fallback.workflowTemplateKey,
    currentStageKey: resolveCurrentStageKey(row.currentStageKey, legacyStatus as DealStatus),
    legacySku: legacySku as SkuType,
    legacyStatus: legacyStatus as DealStatus,
    primaryAssetId: row.primaryAssetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    primaryAsset: row.primaryAsset
      ? {
          id: row.primaryAsset.id,
          name: row.primaryAsset.name,
          address: row.primaryAsset.address,
          parcelNumber: row.primaryAsset.parcelNumber,
          assetClass: row.primaryAsset.assetClass as DealAssetClass | null,
        }
      : null,
  };
}

export async function getDealReaderById(orgId: string, dealId: string): Promise<DealReaderRecord | null> {
  const row = await prisma.deal.findFirst({
    where: {
      id: dealId,
      orgId,
    },
    select: dealReaderSelect,
  });

  return row ? normalizeDealReaderRow(row) : null;
}

export async function listDealReaders(params: {
  orgId: string;
  dealIds?: string[];
}): Promise<DealReaderRecord[]> {
  const rows = await prisma.deal.findMany({
    where: {
      orgId: params.orgId,
      ...(params.dealIds && params.dealIds.length > 0
        ? {
            id: { in: params.dealIds },
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: dealReaderSelect,
  });

  return rows.map(normalizeDealReaderRow);
}

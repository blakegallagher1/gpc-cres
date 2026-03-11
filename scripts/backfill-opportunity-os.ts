import { prisma, type Prisma } from "@entitlement-os/db";
import type {
  DealAssetClass,
  DealStageKey,
  DealStatus,
  DealStrategy,
  SkuType,
  WorkflowTemplateKey,
} from "@entitlement-os/shared";

const LEGACY_SKU_MAP: Record<
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

const LEGACY_STATUS_STAGE_MAP: Record<DealStatus, DealStageKey> = {
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

const ENTITLEMENT_WORKFLOW_STAGES: Array<{
  key: DealStageKey;
  name: string;
  ordinal: number;
  description: string;
  requiredGate: string | null;
}> = [
  {
    key: "ORIGINATION",
    name: "Origination",
    ordinal: 1,
    description: "Lead intake, parcel capture, and initial opportunity framing.",
    requiredGate: null,
  },
  {
    key: "SCREENING",
    name: "Screening",
    ordinal: 2,
    description: "Triage and screen the site before advancing beyond intake.",
    requiredGate: "TRIAGE_DONE",
  },
  {
    key: "UNDERWRITING",
    name: "Underwriting",
    ordinal: 3,
    description: "Pre-application analysis, concept work, and economic feasibility.",
    requiredGate: null,
  },
  {
    key: "DUE_DILIGENCE",
    name: "Due Diligence",
    ordinal: 4,
    description: "Community, zoning, and diligence work needed before filing.",
    requiredGate: null,
  },
  {
    key: "CONTRACTING",
    name: "Contracting",
    ordinal: 5,
    description: "Execution readiness and pre-submission coordination.",
    requiredGate: null,
  },
  {
    key: "EXECUTION",
    name: "Execution",
    ordinal: 6,
    description: "Formal entitlement process through submission, hearing, and approval.",
    requiredGate: null,
  },
  {
    key: "DISPOSITION",
    name: "Disposition",
    ordinal: 7,
    description: "Market the approved deal and pursue the exit.",
    requiredGate: null,
  },
  {
    key: "CLOSED_WON",
    name: "Closed Won",
    ordinal: 8,
    description: "Successful exit or completed opportunity realization.",
    requiredGate: null,
  },
  {
    key: "CLOSED_LOST",
    name: "Closed Lost",
    ordinal: 9,
    description: "Deal terminated or opportunity abandoned.",
    requiredGate: null,
  },
];

type BackfillCounts = {
  deals: number;
  assets: number;
  dealAssets: number;
  workflowTemplates: number;
  workflowStages: number;
  dealsWithPrimaryAsset: number;
  dealsWithGeneralizedFields: number;
  dealsWithLegacyCopies: number;
};

type ParcelSnapshot = {
  id: string;
  address: string;
  apn: string | null;
  lat: Prisma.Decimal | number | string | null;
  lng: Prisma.Decimal | number | string | null;
  acreage: Prisma.Decimal | number | string | null;
  currentZoning: string | null;
};

type DealSnapshot = {
  id: string;
  orgId: string;
  name: string;
  sku: SkuType;
  status: DealStatus;
  assetClass: DealAssetClass | null;
  strategy: DealStrategy | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
  currentStageKey: DealStageKey | null;
  legacySku: SkuType | null;
  legacyStatus: DealStatus | null;
  primaryAssetId: string | null;
  parcels: ParcelSnapshot[];
  primaryAsset: { id: string } | null;
  dealAssets: Array<{ assetId: string; role: "PRIMARY" | "COMPARABLE" | "ADJACENT" }>;
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if ("toNumber" in value && typeof value.toNumber === "function") {
    try {
      return value.toNumber();
    } catch {
      return null;
    }
  }
  return null;
}

function sumAcreage(parcels: ParcelSnapshot[]): number | null {
  let total = 0;
  let hasValue = false;
  for (const parcel of parcels) {
    const acreage = toNumber(parcel.acreage);
    if (acreage == null) continue;
    total += acreage;
    hasValue = true;
  }
  return hasValue ? total : null;
}

function getPrimaryAssetId(deal: DealSnapshot): string | null {
  if (deal.primaryAssetId) return deal.primaryAssetId;
  if (deal.primaryAsset?.id) return deal.primaryAsset.id;
  return deal.dealAssets.find((asset) => asset.role === "PRIMARY")?.assetId ?? null;
}

function buildAssetCreateInput(deal: DealSnapshot): Prisma.AssetUncheckedCreateInput {
  const mapping = LEGACY_SKU_MAP[deal.sku];
  const primaryParcel = deal.parcels[0] ?? null;

  return {
    orgId: deal.orgId,
    name: deal.name,
    address: primaryParcel?.address ?? null,
    parcelNumber: primaryParcel?.apn ?? null,
    assetClass: mapping.assetClass,
    lat: toNumber(primaryParcel?.lat) ?? undefined,
    lng: toNumber(primaryParcel?.lng) ?? undefined,
    acreage: sumAcreage(deal.parcels) ?? undefined,
    zoning: primaryParcel?.currentZoning ?? null,
  };
}

async function collectCounts(tx: Prisma.TransactionClient, orgIds: string[]): Promise<BackfillCounts> {
  const [
    deals,
    assets,
    dealAssets,
    workflowTemplates,
    workflowStages,
    dealsWithPrimaryAsset,
    dealsWithGeneralizedFields,
    dealsWithLegacyCopies,
  ] = await Promise.all([
    tx.deal.count({ where: { orgId: { in: orgIds } } }),
    tx.asset.count({ where: { orgId: { in: orgIds } } }),
    tx.dealAsset.count({ where: { orgId: { in: orgIds } } }),
    tx.workflowTemplate.count({ where: { orgId: { in: orgIds } } }),
    tx.workflowStage.count({ where: { orgId: { in: orgIds } } }),
    tx.deal.count({
      where: {
        orgId: { in: orgIds },
        primaryAssetId: { not: null },
      },
    }),
    tx.deal.count({
      where: {
        orgId: { in: orgIds },
        assetClass: { not: null },
        strategy: { not: null },
        workflowTemplateKey: { not: null },
        currentStageKey: { not: null },
      },
    }),
    tx.deal.count({
      where: {
        orgId: { in: orgIds },
        legacySku: { not: null },
        legacyStatus: { not: null },
      },
    }),
  ]);

  return {
    deals,
    assets,
    dealAssets,
    workflowTemplates,
    workflowStages,
    dealsWithPrimaryAsset,
    dealsWithGeneralizedFields,
    dealsWithLegacyCopies,
  };
}

async function ensureEntitlementTemplate(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<{ id: string }> {
  const template = await tx.workflowTemplate.upsert({
    where: {
      orgId_key: {
        orgId,
        key: "ENTITLEMENT_LAND",
      },
    },
    update: {
      name: "Entitlement Land",
      description: "Compatibility template for legacy entitlement-land opportunities.",
      isDefault: true,
    },
    create: {
      orgId,
      key: "ENTITLEMENT_LAND",
      name: "Entitlement Land",
      description: "Compatibility template for legacy entitlement-land opportunities.",
      isDefault: true,
    },
    select: { id: true },
  });

  const existingStages = await tx.workflowStage.findMany({
    where: { orgId, templateId: template.id },
    select: { id: true, key: true },
  });
  const stageByKey = new Map(existingStages.map((stage) => [stage.key, stage.id]));

  for (const stage of ENTITLEMENT_WORKFLOW_STAGES) {
    const existingStageId = stageByKey.get(stage.key);
    if (existingStageId) {
      await tx.workflowStage.updateMany({
        where: { id: existingStageId, orgId },
        data: {
          name: stage.name,
          ordinal: stage.ordinal,
          description: stage.description,
          requiredGate: stage.requiredGate,
        },
      });
      continue;
    }

    await tx.workflowStage.create({
      data: {
        orgId,
        templateId: template.id,
        key: stage.key,
        name: stage.name,
        ordinal: stage.ordinal,
        description: stage.description,
        requiredGate: stage.requiredGate,
      },
    });
  }

  return template;
}

async function backfillOrgDeals(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  await ensureEntitlementTemplate(tx, orgId);
  const deals = await tx.deal.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orgId: true,
      name: true,
      sku: true,
      status: true,
      assetClass: true,
      strategy: true,
      workflowTemplateKey: true,
      currentStageKey: true,
      legacySku: true,
      legacyStatus: true,
      primaryAssetId: true,
      parcels: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          address: true,
          apn: true,
          lat: true,
          lng: true,
          acreage: true,
          currentZoning: true,
        },
      },
      primaryAsset: { select: { id: true } },
      dealAssets: {
        where: { orgId },
        select: {
          assetId: true,
          role: true,
        },
      },
    },
  });

  for (const deal of deals as DealSnapshot[]) {
    const skuMapping = LEGACY_SKU_MAP[deal.sku];
    const currentStageKey = LEGACY_STATUS_STAGE_MAP[deal.status];

    let primaryAssetId = getPrimaryAssetId(deal);
    if (!primaryAssetId) {
      const asset = await tx.asset.create({
        data: buildAssetCreateInput(deal),
        select: { id: true },
      });
      primaryAssetId = asset.id;
    }

    const primaryDealAsset = deal.dealAssets.find(
      (asset) => asset.assetId === primaryAssetId,
    );
    if (!primaryDealAsset) {
      await tx.dealAsset.create({
        data: {
          orgId,
          dealId: deal.id,
          assetId: primaryAssetId,
          role: "PRIMARY",
        },
      });
    } else if (primaryDealAsset.role !== "PRIMARY") {
      await tx.dealAsset.updateMany({
        where: {
          orgId,
          dealId: deal.id,
          assetId: primaryAssetId,
        },
        data: { role: "PRIMARY" },
      });
    }

    await tx.deal.updateMany({
      where: { id: deal.id, orgId },
      data: {
        primaryAssetId,
        assetClass: deal.assetClass ?? skuMapping.assetClass,
        strategy: deal.strategy ?? skuMapping.strategy,
        workflowTemplateKey: deal.workflowTemplateKey ?? skuMapping.workflowTemplateKey,
        currentStageKey: deal.currentStageKey ?? currentStageKey,
        legacySku: deal.legacySku ?? deal.sku,
        legacyStatus: deal.legacyStatus ?? deal.status,
      },
    });
  }
}

async function main() {
  await prisma.$transaction(
    async (tx) => {
      const orgRows = await tx.deal.findMany({
        distinct: ["orgId"],
        select: { orgId: true },
        orderBy: { orgId: "asc" },
      });
      const orgIds = orgRows.map((row) => row.orgId);

      if (orgIds.length === 0) {
        console.log("[opportunity-os-backfill] no deals found; nothing to backfill");
        return;
      }

      const beforeCounts = await collectCounts(tx, orgIds);
      console.log("[opportunity-os-backfill] before=", JSON.stringify(beforeCounts));

      for (const orgId of orgIds) {
        await backfillOrgDeals(tx, orgId);
      }

      const afterCounts = await collectCounts(tx, orgIds);
      console.log("[opportunity-os-backfill] after=", JSON.stringify(afterCounts));
      console.log(
        "[opportunity-os-backfill] delta=",
        JSON.stringify({
          assetsCreated: afterCounts.assets - beforeCounts.assets,
          dealAssetsCreated: afterCounts.dealAssets - beforeCounts.dealAssets,
          workflowTemplatesCreated: afterCounts.workflowTemplates - beforeCounts.workflowTemplates,
          workflowStagesCreated: afterCounts.workflowStages - beforeCounts.workflowStages,
          dealsWithPrimaryAsset: afterCounts.dealsWithPrimaryAsset - beforeCounts.dealsWithPrimaryAsset,
          dealsWithGeneralizedFields:
            afterCounts.dealsWithGeneralizedFields - beforeCounts.dealsWithGeneralizedFields,
          dealsWithLegacyCopies: afterCounts.dealsWithLegacyCopies - beforeCounts.dealsWithLegacyCopies,
        }),
      );
    },
    { maxWait: 60_000, timeout: 120_000 },
  );
}

main()
  .catch((error) => {
    console.error("[opportunity-os-backfill] fatal:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

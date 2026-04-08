import { prisma } from "@entitlement-os/db";
import { ParcelTriageSchema, type DealStatus, type SkuType } from "@entitlement-os/shared";
import type { DealStageKey } from "@entitlement-os/shared";
import {
  hasOwn,
  projectLegacyDealCompatibility,
  resolveCanonicalDealWorkflowState,
  resolveGeneralizedFieldsFromLegacySku,
  resolveStageKeyFromLegacyStatus,
  toDateOrNull,
} from "./opportunity-phase-compatibility";

type DealCreateInput = {
  name: string;
  sku: string | null;
  jurisdictionId: string | null;
  notes: string | null;
  targetCloseDate: string | null;
  parcelAddress: string | null;
  apn: string | null;
  assetClass: string | null;
  assetSubtype: string | null;
  strategy: string | null;
  workflowTemplateKey: string | null;
  currentStageKey: string | null;
  opportunityKind: string | null;
  dealSourceType: string | null;
  primaryAssetId: string | null;
  marketName: string | null;
  investmentSummary: string | null;
  businessPlanSummary: string | null;
  legacySku: string | null;
  legacyStatus: string | null;
};

type DealUpdateInput = {
  name: string | null;
  sku: string | null;
  status: string | null;
  jurisdictionId: string | null;
  notes: string | null;
  targetCloseDate: string | null;
  assetClass: string | null;
  assetSubtype: string | null;
  strategy: string | null;
  workflowTemplateKey: string | null;
  currentStageKey: string | null;
  opportunityKind: string | null;
  dealSourceType: string | null;
  primaryAssetId: string | null;
  marketName: string | null;
  investmentSummary: string | null;
  businessPlanSummary: string | null;
  legacySku: string | null;
  legacyStatus: string | null;
};

type DealBulkAction =
  | {
      action: "delete";
      ids: string[];
    }
  | {
      action: "update-status";
      ids: string[];
      status: DealStatus;
    };

type RouteAuthContext = {
  orgId: string;
  userId: string;
};

type GatewayConfig = {
  localApiUrl?: string | null;
  localApiKey?: string | null;
  cloudflareAccessHeaders?: Record<string, string>;
  nodeEnv?: string;
  useAppDatabaseDevFallback?: boolean;
  fetchImpl?: typeof fetch;
};

type DealTransitionPayload = {
  stageChange?:
    | {
        dealId: string;
        orgId: string;
        from: string | null;
        to: string;
      }
    | undefined;
  statusChange?:
    | {
        dealId: string;
        orgId: string;
        from: DealStatus;
        to: DealStatus;
      }
    | undefined;
};

const PACK_STALE_DAYS = 7;
const PACK_COVERAGE_MINIMUM = 0.75;

const UPDATEABLE_FIELDS = [
  "name",
  "notes",
  "targetCloseDate",
  "jurisdictionId",
  "assetSubtype",
  "opportunityKind",
  "dealSourceType",
  "primaryAssetId",
  "marketName",
  "investmentSummary",
  "businessPlanSummary",
] as const;

export class DealRouteError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getFetch(fetchImpl?: typeof fetch): typeof fetch {
  return fetchImpl ?? fetch;
}

function getGatewayEnabled(config: GatewayConfig): config is GatewayConfig & {
  localApiUrl: string;
  localApiKey: string;
} {
  return Boolean(config.localApiUrl?.trim() && config.localApiKey?.trim());
}

function toJsonDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function assertPrimaryAsset(
  orgId: string,
  primaryAssetId: string | null,
): Promise<void> | void {
  if (!primaryAssetId) {
    return;
  }

  return prisma.asset
    .findFirst({
      where: { id: primaryAssetId, orgId },
      select: { id: true },
    })
    .then((asset) => {
      if (!asset) {
        throw new DealRouteError(400, "Primary asset not found");
      }
    });
}

async function fetchGatewayDeals(
  auth: RouteAuthContext,
  requestUrl: string,
  config: GatewayConfig & { localApiUrl: string; localApiKey: string },
): Promise<Response> {
  const { searchParams } = new URL(requestUrl);
  const params = new URLSearchParams();
  params.set("org_id", auth.orgId);
  searchParams.forEach((value, key) => params.set(key, value));

  return getFetch(config.fetchImpl)(
    `${config.localApiUrl.replace(/\/$/, "")}/deals?${params.toString()}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.localApiKey}`,
        ...(config.cloudflareAccessHeaders ?? {}),
      },
    },
  );
}

function buildDealsWhere(auth: RouteAuthContext, requestUrl: string): {
  where: Record<string, unknown>;
  limit: number;
  offset: number;
} {
  const { searchParams } = new URL(requestUrl);
  const status = searchParams.get("status");
  const sku = searchParams.get("sku");
  const jurisdictionId = searchParams.get("jurisdictionId");
  const search = searchParams.get("search");
  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const offset = Math.max(
    Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    0,
  );

  const where: Record<string, unknown> = { orgId: auth.orgId };
  if (status) {
    where.status = status;
  }
  if (sku) {
    where.sku = sku;
  }
  if (jurisdictionId) {
    where.jurisdictionId = jurisdictionId;
  }
  if (search) {
    where.name = { contains: search, mode: "insensitive" };
  }

  return { where, limit, offset };
}

export async function listDeals(
  auth: RouteAuthContext,
  requestUrl: string,
  config: GatewayConfig,
): Promise<Record<string, unknown>> {
  if (getGatewayEnabled(config)) {
    const response = await fetchGatewayDeals(auth, requestUrl, config);
    if (!response.ok) {
      throw new DealRouteError(
        response.status >= 500 ? 503 : response.status,
        "Failed to fetch deals from backend",
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  if (config.nodeEnv === "production") {
    throw new DealRouteError(
      503,
      "Deals API requires LOCAL_API_URL in production",
    );
  }

  if (config.useAppDatabaseDevFallback) {
    return { deals: [], degraded: true };
  }

  const { where, limit, offset } = buildDealsWhere(auth, requestUrl);
  const deals = await prisma.deal.findMany({
    where,
    include: {
      jurisdiction: { select: { id: true, name: true } },
      runs: {
        where: { runType: "TRIAGE" },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { outputJson: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });

  return {
    deals: deals.map((deal) => {
      const triageRun = deal.runs[0];
      let triageTier: string | null = null;
      let triageScore: number | null = null;

      if (triageRun?.outputJson && typeof triageRun.outputJson === "object") {
        const output = triageRun.outputJson as Record<string, unknown>;
        const triageCandidate =
          output.triage && typeof output.triage === "object"
            ? (output.triage as Record<string, unknown>)
            : output;
        triageTier =
          (output.tier as string) ?? (triageCandidate.decision as string) ?? null;
        triageScore =
          typeof output.triageScore === "number"
            ? output.triageScore
            : typeof output.confidence === "number"
              ? output.confidence
              : typeof triageCandidate.confidence === "number"
                ? triageCandidate.confidence
                : null;
      }

      return {
        id: deal.id,
        name: deal.name,
        sku: deal.sku,
        status: deal.status,
        assetClass:
          deal.assetClass ??
          resolveGeneralizedFieldsFromLegacySku(deal.sku as SkuType).assetClass,
        strategy:
          deal.strategy ??
          resolveGeneralizedFieldsFromLegacySku(deal.sku as SkuType).strategy,
        workflowTemplateKey:
          deal.workflowTemplateKey ??
          resolveGeneralizedFieldsFromLegacySku(deal.sku as SkuType)
            .workflowTemplateKey,
        currentStageKey:
          deal.currentStageKey ?? resolveStageKeyFromLegacyStatus(deal.status),
        legacySku: deal.legacySku ?? deal.sku,
        legacyStatus: deal.legacyStatus ?? deal.status,
        primaryAssetId: deal.primaryAssetId,
        jurisdiction: deal.jurisdiction,
        createdAt: deal.createdAt.toISOString(),
        updatedAt: deal.updatedAt.toISOString(),
        notes: deal.notes,
        triageTier,
        triageScore,
      };
    }),
  };
}

export async function createDeal(
  auth: RouteAuthContext,
  body: DealCreateInput,
  config: GatewayConfig,
): Promise<Record<string, unknown>> {
  const legacySkuHint = (body.legacySku ?? body.sku) as SkuType | null;
  const legacyStatusHint = (body.legacyStatus ?? "INTAKE") as DealStatus;
  const workflowState = resolveCanonicalDealWorkflowState({
    base: {
      currentStageKey: resolveStageKeyFromLegacyStatus("INTAKE"),
    },
    overrides: {
      assetClass: body.assetClass as never,
      strategy: body.strategy as never,
      workflowTemplateKey: body.workflowTemplateKey as never,
      currentStageKey: body.currentStageKey as never,
    },
    legacySku: legacySkuHint,
    legacyStatus: legacyStatusHint,
  });
  const compatibility = projectLegacyDealCompatibility({
    workflowState,
    legacySkuHint,
    legacyStatusHint,
  });

  if (!body.name.trim() || !body.jurisdictionId || !workflowState.workflowTemplateKey) {
    throw new DealRouteError(
      400,
      "name, workflowTemplateKey or legacy sku, and jurisdictionId are required",
    );
  }

  await assertPrimaryAsset(auth.orgId, body.primaryAssetId);

  const createPayload = {
    ...body,
    assetClass: workflowState.assetClass,
    strategy: workflowState.strategy,
    workflowTemplateKey: workflowState.workflowTemplateKey,
    currentStageKey: workflowState.currentStageKey,
    sku: compatibility.sku,
    status: compatibility.status,
    legacySku: compatibility.legacySku,
    legacyStatus: compatibility.legacyStatus,
  };

  if (getGatewayEnabled(config)) {
    const response = await getFetch(config.fetchImpl)(
      `${config.localApiUrl.replace(/\/$/, "")}/deals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.localApiKey}`,
          "Content-Type": "application/json",
          "X-Org-Id": auth.orgId,
          "X-User-Id": auth.userId,
          ...(config.cloudflareAccessHeaders ?? {}),
        },
        body: JSON.stringify(createPayload),
      },
    );

    if (response.ok) {
      return (await response.json()) as Record<string, unknown>;
    }
  }

  if (config.nodeEnv === "production") {
    throw new DealRouteError(503, "Deals API requires LOCAL_API_URL in production");
  }

  const deal = await prisma.deal.create({
    data: {
      orgId: auth.orgId,
      name: body.name,
      sku: compatibility.sku,
      legacySku: compatibility.legacySku,
      jurisdictionId: body.jurisdictionId,
      status: compatibility.status,
      legacyStatus: compatibility.legacyStatus,
      assetClass: workflowState.assetClass,
      assetSubtype: body.assetSubtype,
      strategy: workflowState.strategy,
      workflowTemplateKey: workflowState.workflowTemplateKey,
      currentStageKey: workflowState.currentStageKey,
      opportunityKind: body.opportunityKind as never,
      dealSourceType: body.dealSourceType as never,
      primaryAssetId: body.primaryAssetId,
      marketName: body.marketName,
      investmentSummary: body.investmentSummary,
      businessPlanSummary: body.businessPlanSummary,
      notes: body.notes ?? null,
      targetCloseDate: toDateOrNull(body.targetCloseDate),
      createdBy: auth.userId,
    },
    include: {
      jurisdiction: { select: { id: true, name: true } },
    },
  });

  if (deal.currentStageKey) {
    await prisma.dealStageHistory.create({
      data: {
        dealId: deal.id,
        orgId: auth.orgId,
        fromStageKey: null,
        toStageKey: deal.currentStageKey,
        changedBy: auth.userId,
        note: "Deal created.",
      },
    });
  }

  if (body.primaryAssetId) {
    await prisma.dealAsset.create({
      data: {
        orgId: auth.orgId,
        dealId: deal.id,
        assetId: body.primaryAssetId,
        role: "PRIMARY",
      },
    });
  }

  if (body.parcelAddress) {
    await prisma.parcel.create({
      data: {
        orgId: auth.orgId,
        dealId: deal.id,
        address: body.parcelAddress,
        apn: body.apn ?? null,
      },
    });
  }

  return { deal };
}

export async function bulkUpdateDeals(
  auth: RouteAuthContext,
  payload: DealBulkAction,
  config: GatewayConfig,
): Promise<Record<string, unknown>> {
  if (getGatewayEnabled(config)) {
    const response = await getFetch(config.fetchImpl)(
      `${config.localApiUrl.replace(/\/$/, "")}/deals`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${config.localApiKey}`,
          "Content-Type": "application/json",
          "X-Org-Id": auth.orgId,
          ...(config.cloudflareAccessHeaders ?? {}),
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      throw new DealRouteError(
        response.status >= 500 ? 503 : response.status,
        "Failed to bulk update deals on backend",
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  const ids = [...new Set(payload.ids)];
  if (ids.length === 0) {
    throw new DealRouteError(400, "No valid deal IDs provided");
  }

  const deals = await prisma.deal.findMany({
    where: { orgId: auth.orgId, id: { in: ids } },
    select: {
      id: true,
      sku: true,
      status: true,
      legacySku: true,
      legacyStatus: true,
      assetClass: true,
      strategy: true,
      workflowTemplateKey: true,
      currentStageKey: true,
    },
  });

  if (payload.action === "delete") {
    const deleted = await prisma.deal.deleteMany({
      where: { orgId: auth.orgId, id: { in: deals.map((deal) => deal.id) } },
    });
    return { success: true, count: deleted.count };
  }

  const updates = deals.map((deal) => {
    const legacySku = (deal.legacySku ?? deal.sku) as SkuType;
    const workflowState = resolveCanonicalDealWorkflowState({
      base: {
        assetClass: deal.assetClass,
        strategy: deal.strategy,
        workflowTemplateKey: deal.workflowTemplateKey,
        currentStageKey: deal.currentStageKey,
      },
      legacySku,
      legacyStatus: payload.status,
    });
    const compatibility = projectLegacyDealCompatibility({
      workflowState,
      legacySkuHint: legacySku,
      legacyStatusHint: payload.status,
    });
    return prisma.deal.update({
      where: { id: deal.id },
      data: {
        status: compatibility.status,
        legacyStatus: compatibility.legacyStatus,
        currentStageKey:
          workflowState.currentStageKey ??
          resolveStageKeyFromLegacyStatus(payload.status),
      },
      select: { id: true, status: true, legacyStatus: true, currentStageKey: true },
    });
  });

  const updated = await prisma.$transaction(updates);
  return { success: true, count: updated.length, deals: updated };
}

export async function getDealDetail(
  auth: RouteAuthContext,
  dealId: string,
  config: GatewayConfig,
): Promise<Record<string, unknown>> {
  if (getGatewayEnabled(config)) {
    try {
      const params = new URLSearchParams({ org_id: auth.orgId, limit: "500" });
      const response = await getFetch(config.fetchImpl)(
        `${config.localApiUrl.replace(/\/$/, "")}/deals?${params.toString()}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${config.localApiKey}`,
            ...(config.cloudflareAccessHeaders ?? {}),
          },
        },
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          deals?: Array<Record<string, unknown>>;
        };
        const gatewayDeal = payload.deals?.find(
          (deal) => String(deal.id ?? "") === dealId,
        );
        if (gatewayDeal) {
          return {
            deal: {
              ...gatewayDeal,
              parcels: [],
              tasks: [],
              artifacts: [],
              uploads: [],
              workflowTemplate: null,
              stageHistory: [],
              generalizedScorecards: [],
              triageOutput: null,
              packContext: {
                hasPack: false,
                isStale: false,
                stalenessDays: null,
                missingEvidence: [
                  "Gateway detail projection in use; full pack context unavailable.",
                ],
                latestPack: null,
              },
            },
          };
        }
      }
    } catch {
      // fall through to Prisma
    }
  }

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId: auth.orgId },
    include: {
      jurisdiction: { select: { id: true, name: true, kind: true, state: true } },
      parcels: { orderBy: { createdAt: "asc" } },
      tasks: { orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }] },
      artifacts: { orderBy: { createdAt: "desc" } },
      uploads: { orderBy: { createdAt: "desc" } },
      stageHistory: { orderBy: { changedAt: "asc" } },
      generalizedScorecards: {
        orderBy: [{ module: "asc" }, { scoredAt: "desc" }, { dimension: "asc" }],
      },
      runs: {
        where: { runType: "TRIAGE" },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { outputJson: true, status: true, finishedAt: true },
      },
    },
  });

  if (!deal) {
    throw new DealRouteError(404, "Deal not found");
  }

  const legacyFields = resolveGeneralizedFieldsFromLegacySku(
    (deal.legacySku ?? deal.sku) as SkuType,
  );
  const resolvedLegacyStatus = (deal.legacyStatus ?? deal.status) as DealStatus;
  const resolvedWorkflowTemplateKey =
    deal.workflowTemplateKey ?? legacyFields.workflowTemplateKey;
  const resolvedCurrentStageKey =
    deal.currentStageKey ?? resolveStageKeyFromLegacyStatus(resolvedLegacyStatus);

  const workflowTemplate = resolvedWorkflowTemplateKey
    ? await prisma.workflowTemplate.findFirst({
        where: {
          orgId: auth.orgId,
          key: resolvedWorkflowTemplateKey,
        },
        include: {
          stages: {
            orderBy: { ordinal: "asc" },
          },
        },
      })
    : null;

  const latestPack = deal.jurisdiction
    ? await prisma.parishPackVersion.findFirst({
        where: {
          jurisdictionId: deal.jurisdiction.id,
          sku: deal.sku,
          status: "current",
        },
        orderBy: { generatedAt: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          generatedAt: true,
          sourceEvidenceIds: true,
          sourceSnapshotIds: true,
          sourceContentHashes: true,
          sourceUrls: true,
          officialOnly: true,
          packCoverageScore: true,
          canonicalSchemaVersion: true,
          coverageSourceCount: true,
          inputHash: true,
        },
      })
    : null;

  let triageTier: string | null = null;
  let triageOutput: Record<string, unknown> | null = null;
  const triageRun = deal.runs[0];
  if (triageRun?.outputJson && typeof triageRun.outputJson === "object") {
    const output = triageRun.outputJson as Record<string, unknown>;
    const triageCandidate =
      output.triage && typeof output.triage === "object"
        ? (output.triage as Record<string, unknown>)
        : output;
    const parsed = ParcelTriageSchema.safeParse({
      ...triageCandidate,
      generated_at: triageCandidate.generated_at ?? new Date().toISOString(),
      deal_id: triageCandidate.deal_id ?? dealId,
    });

    if (parsed.success) {
      triageOutput = parsed.data;
      triageTier = parsed.data.decision;
    }
  }

  const stalenessDays = latestPack ? daysSince(latestPack.generatedAt) : null;
  const packIsStale = stalenessDays === null ? false : stalenessDays >= PACK_STALE_DAYS;
  const missingEvidence: string[] = [];

  if (!latestPack) {
    missingEvidence.push("No current jurisdiction pack found for this deal SKU.");
  } else {
    if (!Array.isArray(latestPack.sourceEvidenceIds)) {
      missingEvidence.push("Pack lineage is missing sourceEvidenceIds.");
    }
    if (!Array.isArray(latestPack.sourceSnapshotIds)) {
      missingEvidence.push("Pack lineage is missing sourceSnapshotIds.");
    }
    if (!Array.isArray(latestPack.sourceContentHashes)) {
      missingEvidence.push("Pack lineage is missing sourceContentHashes.");
    }
    if (packIsStale) {
      missingEvidence.push("Pack is stale and should be refreshed.");
    }
    if (
      typeof latestPack.packCoverageScore === "number" &&
      latestPack.packCoverageScore < PACK_COVERAGE_MINIMUM
    ) {
      missingEvidence.push("Pack coverage score is below the required threshold.");
    }
  }

  return {
    deal: {
      ...deal,
      assetClass: deal.assetClass ?? legacyFields.assetClass,
      strategy: deal.strategy ?? legacyFields.strategy,
      workflowTemplateKey: resolvedWorkflowTemplateKey,
      currentStageKey: resolvedCurrentStageKey,
      legacySku: deal.legacySku ?? deal.sku,
      legacyStatus: resolvedLegacyStatus,
      workflowTemplate: workflowTemplate
        ? {
            id: workflowTemplate.id,
            orgId: workflowTemplate.orgId,
            key: workflowTemplate.key,
            name: workflowTemplate.name,
            description: workflowTemplate.description,
            isDefault: workflowTemplate.isDefault,
            createdAt: workflowTemplate.createdAt.toISOString(),
            updatedAt: workflowTemplate.updatedAt.toISOString(),
            stages: workflowTemplate.stages.map((stage) => ({
              id: stage.id,
              orgId: stage.orgId,
              templateId: stage.templateId,
              key: stage.key,
              name: stage.name,
              ordinal: stage.ordinal,
              description: stage.description,
              requiredGate: stage.requiredGate,
              createdAt: stage.createdAt.toISOString(),
            })),
          }
        : null,
      stageHistory: deal.stageHistory.map((entry) => ({
        ...entry,
        changedAt: entry.changedAt.toISOString(),
      })),
      generalizedScorecards: deal.generalizedScorecards.map((score) => ({
        ...score,
        scoredAt: score.scoredAt.toISOString(),
      })),
      triageTier,
      triageOutput,
      packContext: {
        hasPack: Boolean(latestPack),
        isStale: packIsStale,
        stalenessDays,
        missingEvidence,
        latestPack: latestPack
          ? {
              ...latestPack,
              generatedAt: latestPack.generatedAt.toISOString(),
            }
          : null,
      },
      createdAt: toJsonDate(deal.createdAt),
      updatedAt: toJsonDate(deal.updatedAt),
    },
  };
}

export async function updateDeal(
  auth: RouteAuthContext,
  dealId: string,
  rawBody: Record<string, unknown>,
  body: DealUpdateInput,
): Promise<Record<string, unknown> & DealTransitionPayload> {
  const existing = await prisma.deal.findFirst({
    where: { id: dealId, orgId: auth.orgId },
    select: {
      id: true,
      status: true,
      sku: true,
      legacySku: true,
      legacyStatus: true,
      assetClass: true,
      strategy: true,
      workflowTemplateKey: true,
      currentStageKey: true,
    },
  });

  if (!existing) {
    throw new DealRouteError(404, "Deal not found");
  }

  const data: Record<string, unknown> = {};
  for (const field of UPDATEABLE_FIELDS) {
    if (!hasOwn(rawBody, field)) {
      continue;
    }

    if (field === "name" && (!body.name || !body.name.trim())) {
      throw new DealRouteError(400, "name must be a non-empty string");
    }

    if (field === "jurisdictionId" && !body.jurisdictionId) {
      throw new DealRouteError(
        400,
        "jurisdictionId must be provided when updating jurisdictionId",
      );
    }

    data[field] =
      field === "targetCloseDate"
        ? toDateOrNull(body.targetCloseDate)
        : body[field as keyof DealUpdateInput];
  }

  await assertPrimaryAsset(auth.orgId, hasOwn(rawBody, "primaryAssetId") ? body.primaryAssetId : null);

  if ((hasOwn(rawBody, "sku") || hasOwn(rawBody, "legacySku")) && !(body.legacySku ?? body.sku)) {
    throw new DealRouteError(400, "legacy sku must be provided when updating compatibility sku");
  }

  if (
    (hasOwn(rawBody, "status") || hasOwn(rawBody, "legacyStatus")) &&
    !(body.legacyStatus ?? body.status)
  ) {
    throw new DealRouteError(400, "legacy status must be provided when updating compatibility status");
  }

  const existingLegacySku = (existing.legacySku ?? existing.sku) as SkuType;
  const existingLegacyStatus = (existing.legacyStatus ?? existing.status) as DealStatus;
  const existingWorkflowState = resolveCanonicalDealWorkflowState({
    base: {
      assetClass: existing.assetClass,
      strategy: existing.strategy,
      workflowTemplateKey: existing.workflowTemplateKey,
      currentStageKey: existing.currentStageKey,
    },
    legacySku: existingLegacySku,
    legacyStatus: existingLegacyStatus,
  });

  const touchesWorkflowState =
    hasOwn(rawBody, "sku") ||
    hasOwn(rawBody, "legacySku") ||
    hasOwn(rawBody, "status") ||
    hasOwn(rawBody, "legacyStatus") ||
    hasOwn(rawBody, "assetClass") ||
    hasOwn(rawBody, "strategy") ||
    hasOwn(rawBody, "workflowTemplateKey") ||
    hasOwn(rawBody, "currentStageKey");

  const nextLegacySkuHint = (hasOwn(rawBody, "legacySku")
    ? body.legacySku
    : hasOwn(rawBody, "sku")
      ? body.sku
      : existingLegacySku) as SkuType | null;
  const nextLegacyStatusHint = (hasOwn(rawBody, "legacyStatus")
    ? body.legacyStatus
    : hasOwn(rawBody, "status")
      ? body.status
      : existingLegacyStatus) as DealStatus | null;
  const workflowState = touchesWorkflowState
    ? resolveCanonicalDealWorkflowState({
        base: existingWorkflowState,
        overrides: {
          assetClass: hasOwn(rawBody, "assetClass") ? (body.assetClass as never) : undefined,
          strategy: hasOwn(rawBody, "strategy") ? (body.strategy as never) : undefined,
          workflowTemplateKey: hasOwn(rawBody, "workflowTemplateKey")
            ? (body.workflowTemplateKey as never)
            : undefined,
          currentStageKey: hasOwn(rawBody, "currentStageKey")
            ? (body.currentStageKey as DealStageKey | null | undefined)
            : hasOwn(rawBody, "status") || hasOwn(rawBody, "legacyStatus")
              ? resolveStageKeyFromLegacyStatus(nextLegacyStatusHint)
              : undefined,
        },
        legacySku: nextLegacySkuHint,
        legacyStatus: nextLegacyStatusHint,
      })
    : existingWorkflowState;
  const compatibility = projectLegacyDealCompatibility({
    workflowState,
    legacySkuHint: nextLegacySkuHint,
    legacyStatusHint: nextLegacyStatusHint,
  });

  if (touchesWorkflowState) {
    data.assetClass = workflowState.assetClass;
    data.strategy = workflowState.strategy;
    data.workflowTemplateKey = workflowState.workflowTemplateKey;
    data.currentStageKey = workflowState.currentStageKey;
    data.sku = compatibility.sku;
    data.status = compatibility.status;
    data.legacySku = compatibility.legacySku;
    data.legacyStatus = compatibility.legacyStatus;
  }

  if (Object.keys(data).length === 0) {
    throw new DealRouteError(400, "No valid fields provided");
  }

  const existingResolvedStageKey = existingWorkflowState.currentStageKey;
  const deal = await prisma.deal.update({
    where: { id: dealId },
    data,
    include: {
      jurisdiction: { select: { id: true, name: true } },
    },
  });

  const nextResolvedStageKey = touchesWorkflowState
    ? workflowState.currentStageKey
    : existingResolvedStageKey;
  const nextCompatibilityStatus = touchesWorkflowState
    ? compatibility.status
    : existingLegacyStatus;

  if (hasOwn(rawBody, "primaryAssetId")) {
    if (body.primaryAssetId) {
      await prisma.dealAsset.deleteMany({
        where: {
          orgId: auth.orgId,
          dealId: dealId,
          role: "PRIMARY",
          assetId: { not: body.primaryAssetId },
        },
      });
      await prisma.dealAsset.upsert({
        where: {
          dealId_assetId: {
            dealId: dealId,
            assetId: body.primaryAssetId,
          },
        },
        create: {
          orgId: auth.orgId,
          dealId: dealId,
          assetId: body.primaryAssetId,
          role: "PRIMARY",
        },
        update: { role: "PRIMARY" },
      });
    } else {
      await prisma.dealAsset.deleteMany({
        where: { orgId: auth.orgId, dealId: dealId, role: "PRIMARY" },
      });
    }
  }

  let stageChange: DealTransitionPayload["stageChange"];
  if (nextResolvedStageKey && nextResolvedStageKey !== existingResolvedStageKey) {
    await prisma.dealStageHistory.create({
      data: {
        dealId: dealId,
        orgId: auth.orgId,
        fromStageKey: existingResolvedStageKey,
        toStageKey: nextResolvedStageKey,
        changedBy: auth.userId,
        note: hasOwn(rawBody, "currentStageKey")
          ? "Stage updated from workflow stage change."
          : "Stage updated from legacy compatibility hint.",
      },
    });
    stageChange = {
      dealId,
      orgId: auth.orgId,
      from: existingResolvedStageKey,
      to: nextResolvedStageKey,
    };
  }

  const statusChange =
    nextCompatibilityStatus !== existingLegacyStatus
      ? {
          dealId,
          orgId: auth.orgId,
          from: existingLegacyStatus,
          to: nextCompatibilityStatus,
        }
      : undefined;

  return { deal, stageChange, statusChange };
}

export async function deleteDeal(
  auth: RouteAuthContext,
  dealId: string,
): Promise<{ success: true }> {
  const existing = await prisma.deal.findFirst({
    where: { id: dealId, orgId: auth.orgId },
    select: { id: true },
  });

  if (!existing) {
    throw new DealRouteError(404, "Deal not found");
  }

  await prisma.deal.delete({ where: { id: dealId } });
  return { success: true };
}

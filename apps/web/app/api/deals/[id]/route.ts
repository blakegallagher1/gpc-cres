import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import {
  DealUpdateCompatibilityRequestSchema,
  type DealStatus,
  type SkuType,
} from "@entitlement-os/shared";
import "@/lib/automation/handlers";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import { ParcelTriageSchema } from "@entitlement-os/shared";
import {
  hasOwn,
  projectLegacyDealCompatibility,
  resolveCanonicalDealWorkflowState,
  resolveGeneralizedFieldsFromLegacySku,
  resolveStageKeyFromLegacyStatus,
  toDateOrNull,
} from "../../_lib/opportunityPhase3";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

const PACK_STALE_DAYS = 7;
const PACK_COVERAGE_MINIMUM = 0.75;

function isJsonStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function daysSince(value: Date): number {
  return Math.floor((Date.now() - value.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeDealUpdateRequestBody(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : null,
    sku: typeof body.sku === "string" ? body.sku : null,
    status: typeof body.status === "string" ? body.status : null,
    jurisdictionId:
      typeof body.jurisdictionId === "string" ? body.jurisdictionId : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    targetCloseDate:
      typeof body.targetCloseDate === "string" ? body.targetCloseDate : null,
    assetClass: typeof body.assetClass === "string" ? body.assetClass : null,
    assetSubtype:
      typeof body.assetSubtype === "string" ? body.assetSubtype : null,
    strategy: typeof body.strategy === "string" ? body.strategy : null,
    workflowTemplateKey:
      typeof body.workflowTemplateKey === "string"
        ? body.workflowTemplateKey
        : null,
    currentStageKey:
      typeof body.currentStageKey === "string" ? body.currentStageKey : null,
    opportunityKind:
      typeof body.opportunityKind === "string" ? body.opportunityKind : null,
    dealSourceType:
      typeof body.dealSourceType === "string" ? body.dealSourceType : null,
    primaryAssetId:
      typeof body.primaryAssetId === "string" ? body.primaryAssetId : null,
    marketName: typeof body.marketName === "string" ? body.marketName : null,
    investmentSummary:
      typeof body.investmentSummary === "string"
        ? body.investmentSummary
        : null,
    businessPlanSummary:
      typeof body.businessPlanSummary === "string"
        ? body.businessPlanSummary
        : null,
    legacySku: typeof body.legacySku === "string" ? body.legacySku : null,
    legacyStatus:
      typeof body.legacyStatus === "string" ? body.legacyStatus : null,
  };
}

function toJsonDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

// GET /api/deals/[id] - get a single deal with related data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const localApiUrl = process.env.LOCAL_API_URL?.trim();
    const localApiKey = process.env.LOCAL_API_KEY?.trim();

    // When gateway deals mode is active, IDs in /api/deals may not exist
    // in local Prisma. Try resolving from gateway first for consistency.
    if (localApiUrl && localApiKey) {
      try {
        const query = new URLSearchParams({
          org_id: auth.orgId,
          limit: "500",
        });
        const upstream = await fetch(
          `${localApiUrl.replace(/\/$/, "")}/deals?${query.toString()}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${localApiKey}`,
              ...getCloudflareAccessHeadersFromEnv(),
            },
          },
        );
        if (upstream.ok) {
          const payload = (await upstream.json()) as {
            deals?: Array<Record<string, unknown>>;
          };
          const gatewayDeal = payload.deals?.find(
            (deal) => String(deal.id ?? "") === id,
          );
          if (gatewayDeal) {
            return NextResponse.json({
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
            });
          }
        }
      } catch (error) {
        Sentry.captureException(error, {
          tags: { route: "api.deals", method: "GET" },
        });
        console.warn("[/api/deals/[id]] gateway lookup failed, falling back to Prisma", error);
      }
    }

    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      include: {
        jurisdiction: { select: { id: true, name: true, kind: true, state: true } },
        parcels: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }] },
        artifacts: { orderBy: { createdAt: "desc" } },
        uploads: { orderBy: { createdAt: "desc" } },
        stageHistory: {
          orderBy: { changedAt: "asc" },
        },
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
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
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
        deal_id: triageCandidate.deal_id ?? id,
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
      if (!isJsonStringArray(latestPack.sourceEvidenceIds)) {
        missingEvidence.push("Pack lineage is missing sourceEvidenceIds.");
      }
      if (!isJsonStringArray(latestPack.sourceSnapshotIds)) {
        missingEvidence.push("Pack lineage is missing sourceSnapshotIds.");
      }
      if (!isJsonStringArray(latestPack.sourceContentHashes)) {
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

    return NextResponse.json({
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
          id: entry.id,
          dealId: entry.dealId,
          orgId: entry.orgId,
          fromStageKey: entry.fromStageKey,
          toStageKey: entry.toStageKey,
          changedBy: entry.changedBy,
          changedAt: entry.changedAt.toISOString(),
          note: entry.note,
        })),
        generalizedScorecards: deal.generalizedScorecards.map((score) => ({
          id: score.id,
          dealId: score.dealId,
          orgId: score.orgId,
          module: score.module,
          dimension: score.dimension,
          score: score.score,
          weight: score.weight,
          evidence: score.evidence,
          scoredAt: score.scoredAt.toISOString(),
          scoredBy: score.scoredBy,
        })),
        triageTier,
        triageOutput,
        packContext: {
          hasPack: !!latestPack,
          isStale: packIsStale,
          stalenessDays,
          missingEvidence,
          latestPack: latestPack
            ? {
                id: latestPack.id,
                version: latestPack.version,
                status: latestPack.status,
                generatedAt: latestPack.generatedAt.toISOString(),
                sourceEvidenceIds: latestPack.sourceEvidenceIds,
                sourceSnapshotIds: latestPack.sourceSnapshotIds,
                sourceContentHashes: latestPack.sourceContentHashes,
                sourceUrls: latestPack.sourceUrls,
                officialOnly: latestPack.officialOnly,
                packCoverageScore: latestPack.packCoverageScore,
                canonicalSchemaVersion: latestPack.canonicalSchemaVersion,
                coverageSourceCount: latestPack.coverageSourceCount,
                inputHash: latestPack.inputHash,
              }
            : null,
        },
        createdAt: toJsonDate(deal.createdAt),
        updatedAt: toJsonDate(deal.updatedAt),
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "GET" },
    });
    console.error("Error fetching deal:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "GET" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to fetch deal" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals/[id] - update a deal
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify org ownership before updating
    const existing = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
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
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const rawBody = (await request.json()) as Record<string, unknown>;
    const parsed = DealUpdateCompatibilityRequestSchema.safeParse(
      normalizeDealUpdateRequestBody(rawBody),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 },
      );
    }

    const body = parsed.data;
    const existingLegacySku = (existing.legacySku ?? existing.sku) as SkuType;
    const existingLegacyStatus = (existing.legacyStatus ??
      existing.status) as DealStatus;
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
    const allowedFields = [
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
    ];
    const data: Record<string, unknown> = {};

    for (const field of allowedFields) {
      if (!hasOwn(rawBody, field)) {
        continue;
      }

      if (field === "name" && (!body.name || !body.name.trim())) {
        return NextResponse.json(
          { error: "name must be a non-empty string" },
          { status: 400 },
        );
      }

      if (field === "jurisdictionId" && !body.jurisdictionId) {
        return NextResponse.json(
          { error: "jurisdictionId must be provided when updating jurisdictionId" },
          { status: 400 },
        );
      }

      if (field === "targetCloseDate") {
        data[field] = toDateOrNull(body.targetCloseDate);
        continue;
      }

      data[field] = body[field as keyof typeof body];
    }

    if (hasOwn(rawBody, "primaryAssetId") && body.primaryAssetId) {
      const primaryAsset = await prisma.asset.findFirst({
        where: { id: body.primaryAssetId, orgId: auth.orgId },
        select: { id: true },
      });

      if (!primaryAsset) {
        return NextResponse.json(
          { error: "Primary asset not found" },
          { status: 400 },
        );
      }
    }

    if (
      (hasOwn(rawBody, "sku") || hasOwn(rawBody, "legacySku")) &&
      !(body.legacySku ?? body.sku)
    ) {
      return NextResponse.json(
        { error: "legacy sku must be provided when updating compatibility sku" },
        { status: 400 },
      );
    }

    if (
      (hasOwn(rawBody, "status") || hasOwn(rawBody, "legacyStatus")) &&
      !(body.legacyStatus ?? body.status)
    ) {
      return NextResponse.json(
        { error: "legacy status must be provided when updating compatibility status" },
        { status: 400 },
      );
    }

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
            assetClass: hasOwn(rawBody, "assetClass") ? body.assetClass : undefined,
            strategy: hasOwn(rawBody, "strategy") ? body.strategy : undefined,
            workflowTemplateKey: hasOwn(rawBody, "workflowTemplateKey")
              ? body.workflowTemplateKey
              : undefined,
            currentStageKey: hasOwn(rawBody, "currentStageKey")
              ? body.currentStageKey
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
      return NextResponse.json(
        { error: "No valid fields provided" },
        { status: 400 }
      );
    }

    const existingResolvedStageKey = existingWorkflowState.currentStageKey;

    const deal = await prisma.deal.update({
      where: { id },
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
            dealId: id,
            role: "PRIMARY",
            assetId: { not: body.primaryAssetId },
          },
        });
        await prisma.dealAsset.upsert({
          where: {
            dealId_assetId: {
              dealId: id,
              assetId: body.primaryAssetId,
            },
          },
          create: {
            orgId: auth.orgId,
            dealId: id,
            assetId: body.primaryAssetId,
            role: "PRIMARY",
          },
          update: {
            role: "PRIMARY",
          },
        });
      } else {
        await prisma.dealAsset.deleteMany({
          where: {
            orgId: auth.orgId,
            dealId: id,
            role: "PRIMARY",
          },
        });
      }
    }

    if (nextResolvedStageKey && nextResolvedStageKey !== existingResolvedStageKey) {
      await prisma.dealStageHistory.create({
        data: {
          dealId: id,
          orgId: auth.orgId,
          fromStageKey: existingResolvedStageKey,
          toStageKey: nextResolvedStageKey,
          changedBy: auth.userId,
          note: hasOwn(rawBody, "currentStageKey")
            ? "Stage updated from workflow stage change."
            : "Stage updated from legacy compatibility hint.",
        },
      });

      dispatchEvent({
        type: "deal.stageChanged",
        dealId: id,
        from: existingResolvedStageKey,
        to: nextResolvedStageKey,
        orgId: auth.orgId,
      }).catch((error) => {
        logger.warn("Deal stage change event dispatch failed", {
          eventType: "deal.stageChanged",
          dealId: id,
          orgId: auth.orgId,
          fromStageKey: existingResolvedStageKey,
          toStageKey: nextResolvedStageKey,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (nextCompatibilityStatus !== existingLegacyStatus) {
      dispatchEvent({
        type: "deal.statusChanged",
        dealId: id,
        from: existingLegacyStatus as import("@entitlement-os/shared").DealStatus,
        to: nextCompatibilityStatus as import("@entitlement-os/shared").DealStatus,
        orgId: auth.orgId,
      }).catch((error) => {
        logger.warn("Deal status change event dispatch failed", {
          eventType: "deal.statusChanged",
          dealId: id,
          orgId: auth.orgId,
          fromStatus: existingLegacyStatus,
          toStatus: nextCompatibilityStatus,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return NextResponse.json({ deal });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "PATCH" },
    });
    console.error("Error updating deal:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "PATCH" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to update deal" },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[id] - delete a deal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify org ownership before deleting
    const existing = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    await prisma.deal.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "DELETE" },
    });
    console.error("Error deleting deal:", error);
    Sentry.captureException(error, {
      tags: { route: "/api/deals/[id]", method: "DELETE" },
      fingerprint: ["smoke-test", Date.now().toString()],
      level: "error",
    });
    await Sentry.flush(5000);
    return NextResponse.json(
      { error: "Failed to delete deal" },
      { status: 500 }
    );
  }
}

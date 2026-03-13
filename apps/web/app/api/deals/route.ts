import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import {
  DealCreateCompatibilityRequestSchema,
  type SkuType,
} from "@entitlement-os/shared";
import { z } from "zod";
import "@/lib/automation/handlers";
import { dispatchEvent } from "@/lib/automation/events";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  projectLegacyDealCompatibility,
  resolveCanonicalDealWorkflowState,
  resolveGeneralizedFieldsFromLegacySku,
  resolveLegacyStatusFromStageKey,
  resolveStageKeyFromLegacyStatus,
  toDateOrNull,
} from "../_lib/opportunityPhase3";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";
import * as Sentry from "@sentry/nextjs";

const DealStatusSchema = z.enum([
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
]);

const DealBulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string().uuid()).min(1).max(250),
  }),
  z.object({
    action: z.literal("update-status"),
    ids: z.array(z.string().uuid()).min(1).max(250),
    status: DealStatusSchema,
  }),
]);

function normalizeDealCreateRequestBody(body: Record<string, unknown>) {
  return {
    name: typeof body.name === "string" ? body.name : "",
    sku: typeof body.sku === "string" ? body.sku : null,
    jurisdictionId:
      typeof body.jurisdictionId === "string" ? body.jurisdictionId : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    targetCloseDate:
      typeof body.targetCloseDate === "string" ? body.targetCloseDate : null,
    parcelAddress:
      typeof body.parcelAddress === "string" ? body.parcelAddress : null,
    apn: typeof body.apn === "string" ? body.apn : null,
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

// GET /api/deals - proxy to local FastAPI (production) or Prisma (local dev fallback)
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const localApiUrl = process.env.LOCAL_API_URL?.trim();
    const localApiKey = process.env.LOCAL_API_KEY?.trim();

    // Production: proxy to FastAPI via Cloudflare Tunnel
    if (localApiUrl && localApiKey) {
      const { searchParams } = new URL(request.url);
      const params = new URLSearchParams();
      params.set("org_id", auth.orgId);
      searchParams.forEach((v, k) => params.set(k, v));

      const res = await fetch(`${localApiUrl.replace(/\/$/, "")}/deals?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          ...getCloudflareAccessHeadersFromEnv(),
        },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[api/deals] Local API error:", res.status, text.slice(0, 200));
        return NextResponse.json(
          { error: "Failed to fetch deals from backend" },
          { status: res.status >= 500 ? 503 : res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    // Local dev fallback: Prisma (when LOCAL_API_URL/KEY not set)
    // In production, Prisma must never be used for deals — require LOCAL_API_URL
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Deals API requires LOCAL_API_URL in production" },
        { status: 503 }
      );
    }
    if (shouldUseAppDatabaseDevFallback()) {
      return NextResponse.json({ deals: [], degraded: true });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sku = searchParams.get("sku");
    const jurisdictionId = searchParams.get("jurisdictionId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (status) where.status = status;
    if (sku) where.sku = sku;
    if (jurisdictionId) where.jurisdictionId = jurisdictionId;
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }

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
    });

    const result = deals.map((d: typeof deals[number]) => {
      const triageRun = d.runs[0];
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
        id: d.id,
        name: d.name,
        sku: d.sku,
        status: d.status,
        assetClass:
          d.assetClass ??
          resolveGeneralizedFieldsFromLegacySku(d.sku as SkuType).assetClass,
        strategy:
          d.strategy ??
          resolveGeneralizedFieldsFromLegacySku(d.sku as SkuType).strategy,
        workflowTemplateKey:
          d.workflowTemplateKey ??
          resolveGeneralizedFieldsFromLegacySku(d.sku as SkuType)
            .workflowTemplateKey,
        currentStageKey:
          d.currentStageKey ??
          resolveStageKeyFromLegacyStatus(d.status),
        legacySku: d.legacySku ?? d.sku,
        legacyStatus: d.legacyStatus ?? d.status,
        primaryAssetId: d.primaryAssetId,
        jurisdiction: d.jurisdiction,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        notes: d.notes,
        triageTier,
        triageScore,
      };
    });

    return NextResponse.json({ deals: result });
  } catch (error) {
    if (isSchemaDriftError(error) || isPrismaConnectivityError(error)) {
      return NextResponse.json({ deals: [], degraded: true });
    }
    console.error("Error fetching deals:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to fetch deals" },
      { status: 500 }
    );
  }
}

// POST /api/deals - create a new deal (proxy to FastAPI when LOCAL_API_URL set)
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rawBody = (await request.json()) as Record<string, unknown>;
    const parsed = DealCreateCompatibilityRequestSchema.safeParse(
      normalizeDealCreateRequestBody(rawBody),
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
    const legacySkuHint = body.legacySku ?? body.sku;
    const legacyStatusHint = body.legacyStatus ?? "INTAKE";
    const workflowState = resolveCanonicalDealWorkflowState({
      base: {
        currentStageKey: resolveStageKeyFromLegacyStatus("INTAKE"),
      },
      overrides: {
        assetClass: body.assetClass,
        strategy: body.strategy,
        workflowTemplateKey: body.workflowTemplateKey,
        currentStageKey: body.currentStageKey,
      },
      legacySku: legacySkuHint,
      legacyStatus: legacyStatusHint,
    });
    const compatibility = projectLegacyDealCompatibility({
      workflowState,
      legacySkuHint,
      legacyStatusHint,
    });

    if (
      !body.name.trim() ||
      !body.jurisdictionId ||
      !workflowState.workflowTemplateKey
    ) {
      return NextResponse.json(
        {
          error:
            "name, workflowTemplateKey or legacy sku, and jurisdictionId are required",
        },
        { status: 400 },
      );
    }

    if (body.primaryAssetId) {
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

    const localApiUrl = process.env.LOCAL_API_URL?.trim();
    const localApiKey = process.env.LOCAL_API_KEY?.trim();
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

    if (localApiUrl && localApiKey) {
      const res = await fetch(`${localApiUrl.replace(/\/$/, "")}/deals`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          "Content-Type": "application/json",
          "X-Org-Id": auth.orgId,
          "X-User-Id": auth.userId,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        body: JSON.stringify(createPayload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[api/deals] Local API POST error:", res.status, text.slice(0, 200));
        if (res.status < 500) {
          return NextResponse.json(
            { error: "Failed to create deal" },
            { status: res.status },
          );
        }
        // Gateway-side create failures should not hard-block local workflows.
        // Fall through to Prisma create path.
      }
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data, { status: 201 });
      }
    }

    // Local dev fallback: Prisma
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Deals API requires LOCAL_API_URL in production" },
        { status: 503 }
      );
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
        opportunityKind: body.opportunityKind,
        dealSourceType: body.dealSourceType,
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

    // If a parcel address was provided, create the first parcel
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

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error("Error creating deal:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "POST" },
    });
    return NextResponse.json(
      { error: "Failed to create deal" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals — bulk actions for list of deals (proxy to FastAPI when LOCAL_API_URL set)
export async function PATCH(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = DealBulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; "),
        },
        { status: 400 }
      );
    }

    const localApiUrl = process.env.LOCAL_API_URL?.trim();
    const localApiKey = process.env.LOCAL_API_KEY?.trim();

    if (localApiUrl && localApiKey) {
      const res = await fetch(`${localApiUrl.replace(/\/$/, "")}/deals`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${localApiKey}`,
          "Content-Type": "application/json",
          "X-Org-Id": auth.orgId,
          ...getCloudflareAccessHeadersFromEnv(),
        },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[api/deals] Local API PATCH error:", res.status, text.slice(0, 200));
        return NextResponse.json(
          { error: "Failed to bulk update deals on backend" },
          { status: res.status >= 500 ? 503 : res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data);
    }

    const ids = [...new Set(parsed.data.ids)];
    if (ids.length === 0) {
      return NextResponse.json(
        { error: "No valid deal IDs provided" },
        { status: 400 }
      );
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

    const scopedIds = deals.map((deal) => deal.id);
    if (scopedIds.length === 0) {
      return NextResponse.json({ action: parsed.data.action, updated: 0, skipped: ids.length }, { status: 200 });
    }

    if (parsed.data.action === "delete") {
      const result = await prisma.deal.deleteMany({
        where: { id: { in: scopedIds } },
      });

      return NextResponse.json({
        action: "delete",
        updated: result.count,
        skipped: ids.length - result.count,
        ids: scopedIds,
      });
    }

    const targetLegacyStatus = parsed.data.status;
    const targetStageKey = resolveStageKeyFromLegacyStatus(targetLegacyStatus);
    let updatedCount = 0;

    for (const deal of deals) {
      const existingLegacySku = (deal.legacySku ?? deal.sku) as SkuType;
      const existingLegacyStatus = (deal.legacyStatus ?? deal.status) as z.infer<
        typeof DealStatusSchema
      >;
      const workflowState = resolveCanonicalDealWorkflowState({
        base: {
          assetClass: deal.assetClass,
          strategy: deal.strategy,
          workflowTemplateKey: deal.workflowTemplateKey,
          currentStageKey:
            deal.currentStageKey ??
            resolveStageKeyFromLegacyStatus(existingLegacyStatus),
        },
        overrides: {
          currentStageKey: targetStageKey,
        },
        legacySku: existingLegacySku,
        legacyStatus: targetLegacyStatus,
      });
      const compatibility = projectLegacyDealCompatibility({
        workflowState,
        legacySkuHint: existingLegacySku,
        legacyStatusHint: targetLegacyStatus,
      });
      const previousStageKey =
        deal.currentStageKey ??
        resolveStageKeyFromLegacyStatus(existingLegacyStatus);

      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          assetClass: workflowState.assetClass,
          strategy: workflowState.strategy,
          workflowTemplateKey: workflowState.workflowTemplateKey,
          currentStageKey: workflowState.currentStageKey,
          sku: compatibility.sku,
          status: compatibility.status,
          legacySku: compatibility.legacySku,
          legacyStatus: compatibility.legacyStatus,
        },
      });
      updatedCount += 1;

      if (
        workflowState.currentStageKey &&
        workflowState.currentStageKey !== previousStageKey
      ) {
        await prisma.dealStageHistory.create({
          data: {
            dealId: deal.id,
            orgId: auth.orgId,
            fromStageKey: previousStageKey,
            toStageKey: workflowState.currentStageKey,
            changedBy: auth.userId,
            note: "Stage updated from legacy compatibility hint.",
          },
        });

        dispatchEvent({
          type: "deal.stageChanged",
          dealId: deal.id,
          from: previousStageKey,
          to: workflowState.currentStageKey,
          orgId: auth.orgId,
        }).catch(() => {});
      }

      if (existingLegacyStatus !== compatibility.status) {
        dispatchEvent({
          type: "deal.statusChanged",
          dealId: deal.id,
          from: existingLegacyStatus as import("@entitlement-os/shared").DealStatus,
          to: compatibility.status as import("@entitlement-os/shared").DealStatus,
          orgId: auth.orgId,
        }).catch(() => {});
      }
    }

    return NextResponse.json({
      action: "update-status",
      status: resolveLegacyStatusFromStageKey(targetStageKey, targetLegacyStatus),
      updated: updatedCount,
      skipped: ids.length - updatedCount,
      ids: scopedIds,
    });
  } catch (error) {
    console.error("Error bulk updating deals:", error);
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "PATCH" },
    });
    return NextResponse.json(
      { error: "Failed to bulk update deals" },
      { status: 500 }
    );
  }
}

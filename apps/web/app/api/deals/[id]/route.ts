import { NextRequest, NextResponse } from "next/server";
import {
  DealUpdateCompatibilityRequestSchema,
  type DealStatus,
} from "@entitlement-os/shared";
import * as Sentry from "@sentry/nextjs";
import {
  DealRouteError,
  deleteDeal,
  getDealDetail,
  updateDeal,
} from "@gpc/server";
import "@/lib/automation/handlers";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import { logger } from "@/lib/logger";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";

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

function gatewayConfig() {
  return {
    localApiUrl: process.env.LOCAL_API_URL?.trim(),
    localApiKey: process.env.LOCAL_API_KEY?.trim(),
    cloudflareAccessHeaders: getCloudflareAccessHeadersFromEnv(),
    fetchImpl: fetch.bind(globalThis),
  };
}

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof DealRouteError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const data = await getDealDetail(auth, id, gatewayConfig());
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "GET" },
    });
    return toErrorResponse(error, "Failed to fetch deal");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
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

    const result = await updateDeal(auth, id, rawBody, parsed.data);

    if (result.stageChange) {
      dispatchEvent({
        type: "deal.stageChanged",
        dealId: result.stageChange.dealId,
        from: result.stageChange.from as
          | import("@entitlement-os/shared").DealStageKey
          | null,
        to: result.stageChange.to as import("@entitlement-os/shared").DealStageKey,
        orgId: result.stageChange.orgId,
      }).catch((error) => {
        logger.warn("Deal stage change event dispatch failed", {
          eventType: "deal.stageChanged",
          dealId: result.stageChange?.dealId,
          orgId: result.stageChange?.orgId,
          fromStageKey: result.stageChange?.from,
          toStageKey: result.stageChange?.to,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (result.statusChange) {
      dispatchEvent({
        type: "deal.statusChanged",
        dealId: result.statusChange.dealId,
        from: result.statusChange.from as DealStatus,
        to: result.statusChange.to as DealStatus,
        orgId: result.statusChange.orgId,
      }).catch((error) => {
        logger.warn("Deal status change event dispatch failed", {
          eventType: "deal.statusChanged",
          dealId: result.statusChange?.dealId,
          orgId: result.statusChange?.orgId,
          fromStatus: result.statusChange?.from,
          toStatus: result.statusChange?.to,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return NextResponse.json({ deal: result.deal });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "PATCH" },
    });
    return toErrorResponse(error, "Failed to update deal");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const data = await deleteDeal(auth, id);
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "DELETE" },
    });
    return toErrorResponse(error, "Failed to delete deal");
  }
}

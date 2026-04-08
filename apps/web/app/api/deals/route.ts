import { NextRequest, NextResponse } from "next/server";
import {
  DealCreateCompatibilityRequestSchema,
  type DealStatus,
  type SkuType,
} from "@entitlement-os/shared";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import {
  DealRouteError,
  bulkUpdateDeals,
  createDeal,
  listDeals,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getCloudflareAccessHeadersFromEnv } from "@/lib/server/propertyDbEnv";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";

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

function routeGatewayConfig(request: NextRequest) {
  return {
    localApiUrl: process.env.LOCAL_API_URL?.trim(),
    localApiKey: process.env.LOCAL_API_KEY?.trim(),
    cloudflareAccessHeaders: getCloudflareAccessHeadersFromEnv(),
    nodeEnv: process.env.NODE_ENV,
    useAppDatabaseDevFallback: shouldUseAppDatabaseDevFallback(),
    fetchImpl: fetch.bind(globalThis),
    requestUrl: request.url,
  };
}

function toErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof DealRouteError) {
    const routeError = error;
    return NextResponse.json(
      { error: routeError.message },
      { status: routeError.status },
    );
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await listDeals(auth, request.url, routeGatewayConfig(request));
    return NextResponse.json(data);
  } catch (error) {
    if (isSchemaDriftError(error) || isPrismaConnectivityError(error)) {
      return NextResponse.json({ deals: [], degraded: true });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "GET" },
    });
    return toErrorResponse(error, "Failed to fetch deals");
  }
}

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

    const data = await createDeal(auth, parsed.data, routeGatewayConfig(request));
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "POST" },
    });
    return toErrorResponse(error, "Failed to create deal");
  }
}

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
        { status: 400 },
      );
    }

    const data = await bulkUpdateDeals(
      auth,
      parsed.data as
        | { action: "delete"; ids: string[] }
        | { action: "update-status"; ids: string[]; status: DealStatus },
      routeGatewayConfig(request),
    );
    return NextResponse.json(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.deals", method: "PATCH" },
    });
    return toErrorResponse(error, "Failed to bulk update deals");
  }
}

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  capturePropertyObservations,
  searchProspectsForRoute,
  updateProspectsForRoute,
} from "@gpc/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
} from "@/lib/server/observability";

export async function POST(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/map/prospect");
  await logRequestStart(context, { action: "prospect-search" });
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    const unauthorizedResponse = authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
    await logRequestOutcome(context, {
      status: unauthorizedResponse.status,
      details: { action: "prospect-search" },
    });
    return withRequestId(unauthorizedResponse);
  }
  const auth = authorization.auth;

  let body: {
    polygon?: { coordinates?: number[][][] };
    filters?: {
      searchText?: string;
      minAcreage?: number;
      maxAcreage?: number;
      zoningCodes?: string[];
      excludeFloodZone?: boolean;
      minAssessedValue?: number;
      maxAssessedValue?: number;
    };
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    const response = NextResponse.json(
      { error: "Validation failed", details: { body: ["Invalid JSON body"] } },
      { status: 400 },
    );
    await logRequestOutcome(context, {
      status: 400,
      orgId: auth.orgId,
      userId: auth.userId,
      details: { action: "prospect-search", validationError: "invalid_json" },
    });
    return withRequestId(response);
  }

  const result = await searchProspectsForRoute({
    polygonCoordinates: body.polygon?.coordinates,
    filters: body.filters,
    requestId: context.requestId,
  });

  await logRequestOutcome(context, {
    status: result.status,
    orgId: auth.orgId,
    userId: auth.userId,
    upstream: result.upstream,
    resultCount: result.resultCount,
    details: {
      action: "prospect-search",
      ...result.details,
    },
  });

  if (
    result.status === 200 &&
    Array.isArray((result.body as { parcels?: unknown }).parcels) &&
    (result.body as { parcels?: Array<Record<string, unknown>> }).parcels!.length > 0
  ) {
    void capturePropertyObservations(
      (result.body as { parcels: Array<Record<string, unknown>> }).parcels.map((parcel) => ({
        orgId: auth.orgId,
        observationType: "prospect_match" as const,
        parcelId:
          typeof parcel.parcelUid === "string"
            ? parcel.parcelUid
            : typeof parcel.id === "string"
              ? parcel.id
              : "",
        address: typeof parcel.address === "string" ? parcel.address : "",
        parish: typeof parcel.parish === "string" ? parcel.parish : null,
        owner: typeof parcel.owner === "string" ? parcel.owner : null,
        zoning: typeof parcel.zoning === "string" ? parcel.zoning : null,
        floodZone: typeof parcel.floodZone === "string" ? parcel.floodZone : null,
        acreage: typeof parcel.acreage === "number" ? parcel.acreage : null,
        lat: typeof parcel.lat === "number" ? parcel.lat : null,
        lng: typeof parcel.lng === "number" ? parcel.lng : null,
        sourceRoute: "/api/map/prospect",
      })),
    ).catch(() => {});
  }

  return withRequestId(NextResponse.json(result.body, { status: result.status }));
}

export async function PUT(req: NextRequest) {
  const context = createRequestObservabilityContext(req, "/api/map/prospect");
  await logRequestStart(context, { action: "prospect-bulk" });
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const authorization = await authorizeApiRoute(req, req.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    const unauthorizedResponse = authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
    await logRequestOutcome(context, {
      status: unauthorizedResponse.status,
      details: { action: "prospect-bulk" },
    });
    return withRequestId(unauthorizedResponse);
  }
  const auth = authorization.auth;

  try {
    const body = (await req.json()) as {
      action?: string;
      parcelIds?: unknown;
      parcels?: unknown;
    };
    const result = await updateProspectsForRoute({
      orgId: auth.orgId,
      userId: auth.userId,
      action: body.action,
      parcelIds: body.parcelIds,
      parcels: body.parcels,
    });

    await logRequestOutcome(context, {
      status: result.status,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: result.upstream,
      resultCount: result.resultCount,
      details: result.details,
    });

    return withRequestId(NextResponse.json(result.body, { status: result.status }));
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.map.prospect", method: "PUT" },
    });
    await logRequestOutcome(context, {
      status: 500,
      orgId: auth.orgId,
      userId: auth.userId,
      upstream: "org",
      error,
      details: { action: "prospect-bulk" },
    });
    return withRequestId(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
    );
  }
}

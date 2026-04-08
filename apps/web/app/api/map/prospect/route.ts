import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
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
      orgId: authorization.auth.orgId,
      userId: authorization.auth.userId,
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
    orgId: authorization.auth.orgId,
    userId: authorization.auth.userId,
    upstream: result.upstream,
    resultCount: result.resultCount,
    details: {
      action: "prospect-search",
      ...result.details,
    },
  });

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

  try {
    const body = (await req.json()) as {
      action?: string;
      parcelIds?: unknown;
      parcels?: unknown;
    };
    const result = await updateProspectsForRoute({
      orgId: authorization.auth.orgId,
      userId: authorization.auth.userId,
      action: body.action,
      parcelIds: body.parcelIds,
      parcels: body.parcels,
    });

    await logRequestOutcome(context, {
      status: result.status,
      orgId: authorization.auth.orgId,
      userId: authorization.auth.userId,
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
      orgId: authorization.auth.orgId,
      userId: authorization.auth.userId,
      upstream: "org",
      error,
      details: { action: "prospect-bulk" },
    });
    return withRequestId(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
    );
  }
}

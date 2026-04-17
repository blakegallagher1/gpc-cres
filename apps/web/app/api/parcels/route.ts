import { NextRequest, NextResponse } from "next/server";
import {
  capturePropertyObservations,
  searchParcelsForRoute,
} from "@gpc/server";
import {
  authorizeApiRoute,
} from "@/lib/auth/authorizeApiRoute";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  logRequestOutcome,
  logRequestStart,
} from "@/lib/server/observability";

export async function GET(request: NextRequest) {
  const context = createRequestObservabilityContext(request, "/api/parcels");
  const hasCoords = request.nextUrl.searchParams.get("hasCoords") === "true";
  const searchText = request.nextUrl.searchParams.get("search")?.trim() ?? "";
  const baseDetails = {
    hasCoords,
    hasSearch: searchText.length > 0,
    searchLength: searchText.length,
    requiresGateway: hasCoords || searchText.length > 0,
  };
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  await logRequestStart(context, baseDetails);

  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    const unauthorizedResponse = authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
    await logRequestOutcome(context, {
      status: unauthorizedResponse.status,
      details: baseDetails,
    });
    return withRequestId(unauthorizedResponse);
  }
  const auth = authorization.auth;

  const result = await searchParcelsForRoute({
    orgId: auth.orgId,
    hasCoords,
    searchText,
  });

  await logRequestOutcome(context, {
    status: result.status,
    orgId: auth.orgId,
    userId: auth.userId,
    upstream: result.upstream,
    resultCount: result.resultCount,
    details: result.details,
  });

  const response = NextResponse.json(result.body, { status: result.status });
  if (result.cacheControl) {
    response.headers.set("Cache-Control", result.cacheControl);
  }

  if (
    result.status === 200 &&
    Array.isArray((result.body as { parcels?: unknown }).parcels) &&
    (result.body as { parcels?: Array<Record<string, unknown>> }).parcels!.length > 0
  ) {
    void capturePropertyObservations(
      (result.body as { parcels: Array<Record<string, unknown>> }).parcels.map((parcel) => ({
        orgId: auth.orgId,
        observationType: "parcel_lookup" as const,
        parcelId:
          typeof parcel.parcelId === "string"
            ? parcel.parcelId
            : typeof parcel.id === "string"
              ? parcel.id
              : "",
        address: typeof parcel.address === "string" ? parcel.address : "",
        parish: typeof parcel.parish === "string" ? parcel.parish : null,
        owner: typeof parcel.owner === "string" ? parcel.owner : null,
        zoning:
          typeof parcel.currentZoning === "string"
            ? parcel.currentZoning
            : typeof parcel.zoning === "string"
              ? parcel.zoning
              : null,
        floodZone: typeof parcel.floodZone === "string" ? parcel.floodZone : null,
        acreage: typeof parcel.acreage === "number" ? parcel.acreage : null,
        lat: typeof parcel.lat === "number" ? parcel.lat : null,
        lng: typeof parcel.lng === "number" ? parcel.lng : null,
        sourceRoute: "/api/parcels",
      })),
    ).catch(() => {});
  }

  return withRequestId(response);
}

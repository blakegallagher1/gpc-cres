import { NextRequest, NextResponse } from "next/server";
import { suggestParcelsForRoute } from "@gpc/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
} from "@/lib/server/observability";

export async function GET(request: NextRequest) {
  const context = createRequestObservabilityContext(request, "/api/parcels/suggest");
  const withRequestId = (response: NextResponse) =>
    attachRequestIdHeader(response, context.requestId);

  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return withRequestId(
      authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response,
    );
  }

  const result = await suggestParcelsForRoute({
    orgId: authorization.auth.orgId,
    query: request.nextUrl.searchParams.get("q")?.trim() ?? "",
    rawLimit: request.nextUrl.searchParams.get("limit"),
  });

  const response = NextResponse.json(result.body, { status: result.status });
  if (result.cacheControl) {
    response.headers.set("Cache-Control", result.cacheControl);
  }
  return withRequestId(response);
}

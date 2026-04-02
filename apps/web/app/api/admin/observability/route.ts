import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  attachRequestIdHeader,
  createRequestObservabilityContext,
  queryRecentObservability,
  type ObservabilityLevel,
  type ObservabilityQueryOptions,
} from "@/lib/server/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function isAuthBypassedForLocalDev(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.OBSERVABILITY_ADMIN_LOCAL_BYPASS === "true";
}

function parseLimit(rawLimit: string | null): number | null {
  if (!rawLimit) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    return null;
  }
  return parsed;
}

function parseKind(rawKind: string | null): ObservabilityQueryOptions["kind"] | null {
  if (!rawKind) {
    return "all";
  }
  if (rawKind === "all" || rawKind === "event" || rawKind === "monitor") {
    return rawKind;
  }
  if (rawKind === "snapshot") {
    return "monitor";
  }
  return null;
}

function parseLevel(rawLevel: string | null): ObservabilityLevel | null {
  if (!rawLevel) {
    return null;
  }
  if (rawLevel === "debug" || rawLevel === "info" || rawLevel === "warn" || rawLevel === "error") {
    return rawLevel;
  }
  return null;
}

function parseSince(rawSince: string | null): string | number | null {
  if (!rawSince) {
    return null;
  }
  const numeric = Number(rawSince);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  if (Number.isNaN(Date.parse(rawSince))) {
    return null;
  }
  return rawSince;
}

export async function GET(request: NextRequest) {
  const context = createRequestObservabilityContext(request, "/api/admin/observability");
  const withRequestId = (response: NextResponse) => attachRequestIdHeader(response, context.requestId);
  const authBypassed = isAuthBypassedForLocalDev();
  let viewer: { orgId: string; userId: string } | undefined;
  if (authBypassed) {
    viewer = { orgId: "local-dev-org", userId: "local-dev-user" };
  } else {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return withRequestId(
        authorization.ok
          ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
          : authorization.response,
      );
    }
    viewer = authorization.auth;
  }

  const { searchParams } = request.nextUrl;
  const limit = parseLimit(searchParams.get("limit"));
  if (limit == null) {
    return withRequestId(NextResponse.json({ error: "Invalid limit" }, { status: 400 }));
  }

  const kind = parseKind(searchParams.get("kind"));
  if (kind == null) {
    return withRequestId(NextResponse.json({ error: "Invalid kind" }, { status: 400 }));
  }

  const rawLevel = searchParams.get("level");
  const level = parseLevel(rawLevel);
  if (rawLevel && !level) {
    return withRequestId(NextResponse.json({ error: "Invalid level" }, { status: 400 }));
  }

  const rawSince = searchParams.get("since");
  const since = parseSince(rawSince);
  if (rawSince && since == null) {
    return withRequestId(NextResponse.json({ error: "Invalid since" }, { status: 400 }));
  }

  const result = await queryRecentObservability({
    kind,
    limit,
    since,
    level,
    event: searchParams.get("event"),
    route: searchParams.get("route"),
    requestId: searchParams.get("requestId"),
    orgId: authBypassed ? undefined : viewer.orgId,
    userId: searchParams.get("userId"),
    status: searchParams.get("status"),
    source: searchParams.get("source"),
    surface: searchParams.get("surface"),
  });

  return withRequestId(NextResponse.json({
    ok: true,
    generatedAt: result.generatedAt,
    viewer,
    filters: result.filters,
    stats: result.stats,
    events: result.events,
    monitorSnapshots: result.monitorSnapshots,
  }));
}

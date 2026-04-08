import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  getAdminStats,
  VALID_TABS,
} from "@gpc/server/admin/stats.service";
import type { AdminStatsParams } from "@gpc/server/admin/stats.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const { orgId } = authorization.auth;

  const tab = request.nextUrl.searchParams.get("tab") ?? "overview";
  const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "25", 10)));
  const search = request.nextUrl.searchParams.get("search") ?? "";
  const contentType = request.nextUrl.searchParams.get("contentType") ?? "";
  const offset = (page - 1) * limit;

  if (!VALID_TABS.includes(tab as (typeof VALID_TABS)[number])) {
    return NextResponse.json(
      { error: "Invalid tab parameter", detail: `Expected one of: ${VALID_TABS.join(", ")}` },
      { status: 400 },
    );
  }

  const params: AdminStatsParams = {
    tab,
    page,
    limit,
    offset,
    search,
    contentType,
    subTab: request.nextUrl.searchParams.get("subTab") ?? "facts",
  };

  try {
    const result = await getAdminStats(orgId, params);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[admin/stats] unexpected error tab=%s", tab, message, stack);
    return NextResponse.json(
      { error: "Internal server error", detail: message, tab },
      { status: 500 },
    );
  }
}

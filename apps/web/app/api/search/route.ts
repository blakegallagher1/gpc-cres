import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { runGlobalSearch } from "@gpc/server/search/global-search.service";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { globalSearchQuerySchema } from "@/lib/search/globalSearch";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = globalSearchQuerySchema.safeParse({
    q: request.nextUrl.searchParams.get("q"),
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "request";
    return NextResponse.json(
      { error: `${path}: ${issue?.message ?? "Invalid request"}` },
      { status: 400 },
    );
  }

  try {
    const { q: query, limit } = parsed.data;
    const response = await runGlobalSearch({
      orgId: auth.orgId,
      query,
      limit,
    });
    return NextResponse.json(response);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.search", method: "GET" },
    });

    return NextResponse.json(
      { error: "Failed to search workspace content" },
      { status: 500 },
    );
  }
}

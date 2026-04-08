import { NextRequest, NextResponse } from "next/server";
import { listEvidenceSources } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

function parseBoolean(value: string | null): boolean {
  return value === "true";
}

function parseLimit(value: string | null, fallback: number): number {
  if (value == null || value.trim().length === 0) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), 120));
}

// GET /api/evidence - list evidence sources
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const officialOnly = searchParams.get("official");
    const sourceId = searchParams.get("sourceId");
    const includeSnapshots = parseBoolean(searchParams.get("includeSnapshots")) && !!sourceId;
    const snapshotLimit = parseLimit(searchParams.get("snapshotLimit"), 25);

    const result = await listEvidenceSources({
      orgId: auth.orgId,
      search,
      officialOnly: officialOnly === "true",
      sourceId,
      includeSnapshots,
      snapshotLimit,
    });

    return NextResponse.json({ sources: result });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.evidence", method: "GET" },
    });
    console.error("Error fetching evidence sources:", error);
    return NextResponse.json(
      { error: "Failed to fetch evidence sources" },
      { status: 500 },
    );
  }
}

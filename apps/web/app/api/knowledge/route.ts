import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  searchKnowledgeBase,
  ingestKnowledge,
  getKnowledgeStats,
  getRecentEntries,
  deleteKnowledge,
  KNOWLEDGE_CONTENT_TYPES,
  type KnowledgeContentType,
  type KnowledgeSearchMode,
  resolveKnowledgeSearchMode,
  isKnowledgeSearchError,
} from "@/lib/services/knowledgeBase.service";
import { getInstitutionalKnowledgeIngestService } from "@/lib/services/institutionalKnowledgeIngest.service";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import * as Sentry from "@sentry/nextjs";

function isKnowledgeContentType(value: string): value is KnowledgeContentType {
  return (KNOWLEDGE_CONTENT_TYPES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "stats";

  try {
    switch (view) {
      case "search": {
        const query = searchParams.get("q");
        if (!query) {
          return NextResponse.json(
            { error: "q (query) is required for search" },
            { status: 400 }
          );
        }
        const rawContentTypes = searchParams.get("types")
          ? searchParams
              .get("types")!
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined;
        if (rawContentTypes && rawContentTypes.some((value) => !isKnowledgeContentType(value))) {
          return NextResponse.json(
            { error: `types must be a comma-separated list of: ${KNOWLEDGE_CONTENT_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        const contentTypes = rawContentTypes as KnowledgeContentType[] | undefined;
        const limit = Number(searchParams.get("limit") ?? 5);
        const requestedMode = (searchParams.get("mode") ?? "auto") as KnowledgeSearchMode;

        if (!["auto", "exact", "semantic"].includes(requestedMode)) {
          return NextResponse.json(
            { error: "mode must be one of: auto, exact, semantic" },
            { status: 400 }
          );
        }

        const resolvedMode = resolveKnowledgeSearchMode(query, requestedMode);
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            {
              error: "Knowledge base is temporarily unavailable",
              degraded: true,
              mode: resolvedMode,
              results: [],
            },
            { status: 503 },
          );
        }
        const results = await searchKnowledgeBase(
          auth.orgId,
          query,
          contentTypes,
          limit,
          requestedMode
        );
        return NextResponse.json({ mode: resolvedMode, results });
      }
      case "recent": {
        const rawContentType = searchParams.get("type");
        if (rawContentType && !isKnowledgeContentType(rawContentType)) {
          return NextResponse.json(
            { error: `type must be one of: ${KNOWLEDGE_CONTENT_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        const contentType = rawContentType as KnowledgeContentType | null;
        const limit = Number(searchParams.get("limit") ?? 20);
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            {
              error: "Knowledge base is temporarily unavailable",
              degraded: true,
              entries: [],
            },
            { status: 503 },
          );
        }
        const entries = await getRecentEntries(auth.orgId, limit, contentType ?? undefined);
        return NextResponse.json({ entries });
      }
      case "stats":
      default: {
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            {
              error: "Knowledge base is temporarily unavailable",
              degraded: true,
              total: 0,
              contentTypes: {},
            },
            { status: 503 },
          );
        }
        const stats = await getKnowledgeStats(auth.orgId);
        return NextResponse.json(stats);
      }
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.knowledge", method: "GET" },
    });
    console.error("Knowledge base error:", error);
    if (isKnowledgeSearchError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to query knowledge base" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "ingest": {
        const { contentType, sourceId, contentText, metadata } = body;
        if (!contentType || !sourceId || !contentText) {
          return NextResponse.json(
            { error: "contentType, sourceId, and contentText are required" },
            { status: 400 }
          );
        }
        if (typeof contentType !== "string" || !isKnowledgeContentType(contentType)) {
          return NextResponse.json(
            { error: `contentType must be one of: ${KNOWLEDGE_CONTENT_TYPES.join(", ")}` },
            { status: 400 },
          );
        }
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            { error: "Knowledge base is temporarily unavailable", degraded: true },
            { status: 503 },
          );
        }
        const ids = await ingestKnowledge(
          auth.orgId,
          contentType,
          sourceId,
          contentText,
          metadata ?? {}
        );
        return NextResponse.json({ ids, chunks: ids.length });
      }
      case "ingest_workbook": {
        const { uploadId, dealId } = body;
        if (!uploadId || !dealId) {
          return NextResponse.json(
            { error: "uploadId and dealId are required" },
            { status: 400 }
          );
        }
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            { error: "Knowledge base is temporarily unavailable", degraded: true },
            { status: 503 },
          );
        }

        const result = await getInstitutionalKnowledgeIngestService().ingestWorkbookUpload(
          uploadId,
          dealId,
          auth.orgId
        );
        return NextResponse.json(result);
      }
      case "delete": {
        const { sourceId } = body;
        if (!sourceId) {
          return NextResponse.json(
            { error: "sourceId is required" },
            { status: 400 }
          );
        }
        if (shouldUseAppDatabaseDevFallback()) {
          return NextResponse.json(
            { error: "Knowledge base is temporarily unavailable", degraded: true },
            { status: 503 },
          );
        }
        const deleted = await deleteKnowledge(auth.orgId, sourceId);
        return NextResponse.json({ deleted });
      }
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: ingest, ingest_workbook, delete" },
          { status: 400 }
        );
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.knowledge", method: "POST" },
    });
    console.error("Knowledge ingest error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

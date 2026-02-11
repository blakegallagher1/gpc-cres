import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  searchKnowledgeBase,
  ingestKnowledge,
  getKnowledgeStats,
  getRecentEntries,
  deleteKnowledge,
  type KnowledgeContentType,
} from "@/lib/services/knowledgeBase.service";

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
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
        const contentTypes = searchParams.get("types")
          ? (searchParams.get("types")!.split(",") as KnowledgeContentType[])
          : undefined;
        const limit = Number(searchParams.get("limit") ?? 5);
        const results = await searchKnowledgeBase(query, contentTypes, limit);
        return NextResponse.json({ results });
      }
      case "recent": {
        const contentType = searchParams.get("type") as KnowledgeContentType | null;
        const limit = Number(searchParams.get("limit") ?? 20);
        const entries = await getRecentEntries(limit, contentType ?? undefined);
        return NextResponse.json({ entries });
      }
      case "stats":
      default: {
        const stats = await getKnowledgeStats();
        return NextResponse.json(stats);
      }
    }
  } catch (error) {
    console.error("Knowledge base error:", error);
    return NextResponse.json(
      { error: "Failed to query knowledge base" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
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
        const ids = await ingestKnowledge(
          contentType as KnowledgeContentType,
          sourceId,
          contentText,
          metadata ?? {}
        );
        return NextResponse.json({ ids, chunks: ids.length });
      }
      case "delete": {
        const { sourceId } = body;
        if (!sourceId) {
          return NextResponse.json(
            { error: "sourceId is required" },
            { status: 400 }
          );
        }
        const deleted = await deleteKnowledge(sourceId);
        return NextResponse.json({ deleted });
      }
      default:
        return NextResponse.json(
          { error: "Invalid action. Use: ingest, delete" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Knowledge ingest error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

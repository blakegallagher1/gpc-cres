import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { getCausalTraces } from "@/lib/services/causalPropagation";
import * as Sentry from "@sentry/nextjs";

// GET /api/entities/[id]/causal-traces — Get causal impact traces for an entity
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await resolveAuth(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const traces = await getCausalTraces(auth.orgId, id, limit);

    return NextResponse.json({ traces });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.entities.causal-traces", method: "GET" },
    });
    console.error("Error fetching causal traces:", error);
    return NextResponse.json(
      { error: "Failed to fetch causal traces" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

type TraceRow = {
  id: string;
  run_id: string;
  parent_id: string | null;
  type: string;
  name: string;
  input: unknown;
  output: unknown;
  started_at: Date;
  duration_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost: number | null;
  metadata: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

// GET /api/runs/[runId]/traces - trace list (best-effort; returns [] if traces table is unavailable)
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    // Ensure run is org-scoped before attempting to read traces.
    const run = await prisma.run.findFirst({
      where: { id: runId, orgId: auth.orgId },
      select: { id: true },
    });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      const rows = await prisma.$queryRawUnsafe<TraceRow[]>(
        `SELECT
           t.id,
           t.run_id,
           t.parent_id,
           t.type,
           t.name,
           t.input,
           t.output,
           t.started_at,
           t.duration_ms,
           t.tokens_input,
           t.tokens_output,
           t.cost,
           t.metadata
         FROM traces t
         JOIN runs r ON r.id = t.run_id
         WHERE t.run_id = $1 AND r.org_id = $2
         ORDER BY t.started_at ASC`,
        runId,
        auth.orgId,
      );

      const traces = rows.map((row) => ({
        id: row.id,
        runId: row.run_id,
        parentId: row.parent_id ?? null,
        type:
          row.type === "llm" || row.type === "tool" || row.type === "handoff" || row.type === "custom"
            ? row.type
            : "custom",
        name: row.name,
        input: toJsonRecord(row.input),
        output: toJsonRecord(row.output),
        startedAt: row.started_at.toISOString(),
        durationMs: row.duration_ms ?? null,
        tokensInput: row.tokens_input ?? null,
        tokensOutput: row.tokens_output ?? null,
        cost: row.cost ?? null,
        metadata: toJsonRecord(row.metadata),
      }));

      return NextResponse.json({ traces });
    } catch (traceError) {
      // The traces table is not part of the Prisma schema/migrations yet in some envs.
      // Fail open by returning an empty list so the run detail UI can still render.
      console.warn("Traces query failed; returning empty traces list.", traceError);
      return NextResponse.json({ traces: [] });
    }
  } catch (error) {
    console.error("Error fetching run traces:", error);
    return NextResponse.json(
      { error: "Failed to fetch traces" },
      { status: 500 },
    );
  }
}

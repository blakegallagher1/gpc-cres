import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

// GET /api/runs/[runId] - run details (org-scoped)
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

    const run = await prisma.run.findFirst({
      where: { id: runId, orgId: auth.orgId },
      select: {
        id: true,
        orgId: true,
        runType: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        dealId: true,
        jurisdictionId: true,
        sku: true,
        error: true,
        inputHash: true,
        openaiResponseId: true,
        outputJson: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const durationMs = run.finishedAt
      ? run.finishedAt.getTime() - run.startedAt.getTime()
      : null;

    return NextResponse.json({
      run: {
        id: run.id,
        orgId: run.orgId,
        runType: run.runType,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs,
        dealId: run.dealId ?? null,
        jurisdictionId: run.jurisdictionId ?? null,
        sku: run.sku ?? null,
        error: run.error ?? null,
        inputHash: run.inputHash ?? null,
        openaiResponseId: run.openaiResponseId ?? null,
        outputJson: run.outputJson ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching run:", error);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}

// DELETE /api/runs/[runId] - delete run (org-scoped)
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;

    const deleted = await prisma.run.deleteMany({
      where: { id: runId, orgId: auth.orgId },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting run:", error);
    return NextResponse.json({ error: "Failed to delete run" }, { status: 500 });
  }
}


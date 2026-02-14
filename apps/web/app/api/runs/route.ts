import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { AGENT_RUN_STATE_KEYS } from "@entitlement-os/shared";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function readSummaryFromOutputJson(outputJson: unknown): {
  lastAgentName?: string;
  confidence?: number | null;
  evidenceCount: number;
  missingEvidenceCount: number;
  toolCount: number;
} {
  if (!isRecord(outputJson)) {
    return {
      evidenceCount: 0,
      missingEvidenceCount: 0,
      toolCount: 0,
    };
  }

  const runState = isRecord(outputJson.runState) ? outputJson.runState : null;
  const lastAgentName =
    typeof outputJson.lastAgentName === "string"
      ? outputJson.lastAgentName
      : runState && typeof runState[AGENT_RUN_STATE_KEYS.lastAgentName] === "string"
        ? String(runState[AGENT_RUN_STATE_KEYS.lastAgentName])
        : undefined;

  const confidenceCandidate =
    typeof outputJson.confidence === "number" && Number.isFinite(outputJson.confidence)
      ? outputJson.confidence
      : runState &&
        typeof runState[AGENT_RUN_STATE_KEYS.confidence] === "number" &&
        Number.isFinite(runState[AGENT_RUN_STATE_KEYS.confidence])
        ? Number(runState[AGENT_RUN_STATE_KEYS.confidence])
        : null;

  const missingEvidence = Array.isArray(outputJson.missingEvidence)
    ? toStringArray(outputJson.missingEvidence)
    : runState && Array.isArray(runState[AGENT_RUN_STATE_KEYS.missingEvidence])
      ? toStringArray(runState[AGENT_RUN_STATE_KEYS.missingEvidence])
      : [];

  const toolsInvoked = Array.isArray(outputJson.toolsInvoked)
    ? toStringArray(outputJson.toolsInvoked)
    : runState && Array.isArray(runState[AGENT_RUN_STATE_KEYS.toolsInvoked])
      ? toStringArray(runState[AGENT_RUN_STATE_KEYS.toolsInvoked])
      : [];

  const evidenceCount = Array.isArray(outputJson.evidenceCitations)
    ? outputJson.evidenceCitations.length
    : 0;

  return {
    lastAgentName,
    confidence: confidenceCandidate,
    evidenceCount,
    missingEvidenceCount: missingEvidence.length,
    toolCount: toolsInvoked.length,
  };
}

// GET /api/runs - list runs for org (workflow runs)
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const runType = searchParams.get("runType");
    const dealId = searchParams.get("dealId");
    const jurisdictionId = searchParams.get("jurisdictionId");
    const limitRaw = searchParams.get("limit");

    const limit =
      limitRaw && Number.isFinite(Number(limitRaw))
        ? Math.max(1, Math.min(200, Math.floor(Number(limitRaw))))
        : 50;

    const where: Record<string, unknown> = { orgId: auth.orgId };
    if (typeof status === "string" && status.length > 0) where.status = status;
    if (typeof runType === "string" && runType.length > 0) where.runType = runType;
    if (typeof dealId === "string" && dealId.length > 0) where.dealId = dealId;
    if (typeof jurisdictionId === "string" && jurisdictionId.length > 0) {
      where.jurisdictionId = jurisdictionId;
    }

    const runs = await prisma.run.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
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

    const result = runs.map((run) => {
      const durationMs = run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null;
      return {
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
        summary: readSummaryFromOutputJson(run.outputJson),
      };
    });

    return NextResponse.json({ runs: result });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}


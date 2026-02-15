/**
 * POST /api/runs/{runId}/reward - persist reinforcement signal for a run episode.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { addRewardSignal } from "@/lib/agent/reward.service";

type RewardPayload = {
  userScore?: unknown;
  autoScore?: unknown;
};

/**
 * Persist a reward signal for the latest auto-fed episode tied to a run.
 */
export async function POST(
  request: NextRequest,
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
        outputJson: true,
      },
    });

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const payload = (await request.json().catch(() => null)) as RewardPayload | null;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid reward payload" }, { status: 400 });
    }

    const userScore = normalizeUserScore(payload.userScore);
    if (userScore === null) {
      return NextResponse.json(
        { error: "Invalid userScore. Must be an integer between 0 and 5." },
        { status: 400 },
      );
    }

    const episodeRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "Episode" WHERE run_id = $1 LIMIT 1`,
      runId,
    );
    const episodeId = episodeRows[0]?.id;
    if (!episodeId) {
      return NextResponse.json(
        { error: "No episode exists for this run yet. Try again shortly." },
        { status: 409 },
      );
    }

    const outputJson = run.outputJson as Record<string, unknown> | null;
    const derivedAutoScore = normalizeAutoScore(payload.autoScore, outputJson?.confidence);

    const reward = await addRewardSignal(
      episodeId,
      userScore,
      derivedAutoScore,
    );

    return NextResponse.json({
      ok: true,
      reward: {
        id: reward.id,
        episodeId: reward.episodeId,
        userScore: reward.userScore,
        autoScore: reward.autoScore,
        timestamp: reward.timestamp,
      },
    });
  } catch (error) {
    console.error("Error saving run reward", error);
    if ((error as Error).message.includes("does not exist")) {
      return NextResponse.json({ error: "Episode not found for this run" }, { status: 404 });
    }
    if (
      (error as Error).message.includes("userScore must be an integer between 0 and 5") ||
      (error as Error).message.includes("autoScore must be between 0 and 1")
    ) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to persist reward" }, { status: 500 });
  }
}

function normalizeUserScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    return null;
  }
  return value;
}

function normalizeAutoScore(value: unknown, fallbackValue: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clamp01(value);
  }

  const fallback =
    typeof fallbackValue === "number" && Number.isFinite(fallbackValue)
      ? fallbackValue
      : 0.25;
  return clamp01(fallback);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

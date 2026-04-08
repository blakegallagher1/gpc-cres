/**
 * POST /api/runs/{runId}/reward - persist reinforcement signal for a run episode.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createRunReward,
  RunConflictError,
  RunRouteNotFoundError,
  RunValidationError,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

type RewardPayload = {
  userScore?: unknown;
  autoScore?: unknown;
};
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { runId } = await context.params;
    const payload = (await request.json().catch(() => null)) as RewardPayload | null;
    const reward = await createRunReward(auth.orgId, runId, payload);

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
    if (error instanceof RunRouteNotFoundError) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (error instanceof RunValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RunConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.runs.reward", method: "POST" },
    });
    console.error("Error saving run reward", error);
    return NextResponse.json({ error: "Failed to persist reward" }, { status: 500 });
  }
}

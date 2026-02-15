/**
 * Reward service shim for web API routes to persist reinforcement feedback.
 */

import { prisma } from "@entitlement-os/db";

export interface RewardRecord {
  id: string;
  episodeId: string;
  userScore: number;
  autoScore: number;
  timestamp: string;
}

/**
 * Persist a reinforcement signal for an episode.
 */
export async function addRewardSignal(
  episodeId: string,
  userScore: number,
  autoScore: number,
): Promise<RewardRecord> {
  if (!episodeId || typeof episodeId !== "string") {
    throw new Error("episodeId is required");
  }
  if (!Number.isInteger(userScore) || userScore < 0 || userScore > 5) {
    throw new Error("userScore must be an integer between 0 and 5");
  }
  if (!Number.isFinite(autoScore) || autoScore < 0 || autoScore > 1) {
    throw new Error("autoScore must be between 0 and 1");
  }

  const episodeRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "Episode" WHERE id = $1 LIMIT 1`,
    episodeId,
  );
  if (!episodeRows[0]?.id) {
    throw new Error(`Episode ${episodeId} does not exist`);
  }

  const createdRewardRows = await prisma.$queryRawUnsafe<
    Array<{ id: string; episode_id: string; user_score: number; auto_score: number; timestamp: Date }>
  >(
    `INSERT INTO "RewardSignal" (episode_id, user_score, auto_score)
     VALUES ($1, $2, $3)
     RETURNING id, episode_id, user_score, auto_score, timestamp`,
    episodeId,
    userScore,
    autoScore,
  );
  const reward = createdRewardRows[0];
  if (!reward) {
    throw new Error("RewardSignal insert failed");
  }

  const composite = (userScore / 5) * 0.7 + autoScore * 0.3;
  const outcomeSignal = composite >= 0.8
    ? "positive_feedback"
    : composite >= 0.5
    ? "neutral_feedback"
    : "negative_feedback";

  await prisma.$queryRawUnsafe(
    `UPDATE "Episode" SET outcome_signal = $1 WHERE id = $2`,
    outcomeSignal,
    episodeId,
  );

  return {
    id: reward.id,
    episodeId: reward.episode_id,
    userScore: reward.user_score,
    autoScore: reward.auto_score,
    timestamp: reward.timestamp.toISOString(),
  };
}

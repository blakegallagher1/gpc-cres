/**
 * Reinforcement-learning feedback API for agent memory updates.
 */

import { createRequire } from "node:module";
import { prisma } from "@entitlement-os/db";
import { withSpan } from "../openTelemetry/setup.ts";

export interface RewardRecord {
  id: string;
  episodeId: string;
  userScore: number;
  autoScore: number;
  timestamp: string;
}

const requireModule = createRequire(import.meta.url);
const telemetry = loadDataAgentTelemetry();

type RewardMetricPayload = {
  episodeId: string;
  userScore: number;
  autoScore: number;
};

function recordDataAgentReward(payload: RewardMetricPayload): void {
  telemetry.recordDataAgentReward?.(payload);
}

function loadDataAgentTelemetry(): {
  recordDataAgentReward?: (payload: RewardMetricPayload) => void;
} {
  try {
    const sharedTelemetry = requireModule("@entitlement-os/shared");
    if (
      sharedTelemetry &&
      typeof sharedTelemetry.recordDataAgentReward === "function"
    ) {
      return {
        recordDataAgentReward: sharedTelemetry.recordDataAgentReward as (
          payload: RewardMetricPayload,
        ) => void,
      };
    }
  } catch {
    // optional shared dependency fallback
  }
  return {};
}

/**
 * Add reinforcement signal and annotate the episode outcome state.
 */
export async function addRewardSignal(
  episodeId: string,
  userScore: number,
  autoScore: number,
): Promise<RewardRecord> {
  validateInput(episodeId, userScore, autoScore);

  const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
  if (!episode) {
    throw new Error(`Episode ${episodeId} does not exist`);
  }

  const reward = await withSpan("addRewardSignal.persist", () =>
    prisma.rewardSignal.create({
      data: {
        episodeId,
        userScore,
        autoScore,
      },
    }),
  );

  const outcomeSignal = deriveOutcomeSignal(userScore, autoScore);
  await withSpan("addRewardSignal.annotate", () =>
    prisma.episode.update({
      where: { id: episodeId },
      data: { outcomeSignal },
    }),
  );
  recordDataAgentReward({
    episodeId,
    userScore,
    autoScore,
  });

  return {
    id: reward.id,
    episodeId: reward.episodeId,
    userScore: reward.userScore,
    autoScore: reward.autoScore,
    timestamp: reward.timestamp.toISOString(),
  };
}

function deriveOutcomeSignal(userScore: number, autoScore: number): string {
  const normalizedAuto = clamp01(autoScore);
  const composite = (userScore / 5) * 0.7 + normalizedAuto * 0.3;
  if (composite >= 0.8) return "positive_feedback";
  if (composite >= 0.5) return "neutral_feedback";
  return "negative_feedback";
}

function validateInput(episodeId: string, userScore: number, autoScore: number): void {
  if (!episodeId || typeof episodeId !== "string") {
    throw new Error("episodeId is required");
  }
  if (!Number.isInteger(userScore) || userScore < 0 || userScore > 5) {
    throw new Error("userScore must be an integer between 0 and 5");
  }
  if (!Number.isFinite(autoScore) || autoScore < 0 || autoScore > 1) {
    throw new Error("autoScore must be between 0 and 1");
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

import type { PrismaClient } from "@entitlement-os/db";

import type { TokenUsage } from "../schemas.js";

type ModelPricing = {
  input: number;
  output: number;
  reasoning?: number;
};

const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.2": { input: 0.005, output: 0.015, reasoning: 0.015 },
  "gpt-5.1": { input: 0.003, output: 0.010, reasoning: 0.010 },
  "gpt-4.1": { input: 0.002, output: 0.008, reasoning: 0.008 },
  "text-embedding-3-large": { input: 0.00013, output: 0 },
  "text-embedding-3-small": { input: 0.00002, output: 0 },
};

const DEFAULT_PRICING: ModelPricing = { input: 0.005, output: 0.015, reasoning: 0.015 };

export function computeRunCost(tokenUsage: TokenUsage, model: string): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;
  const inputCost = (tokenUsage.input / 1000) * pricing.input;
  const outputCost = (tokenUsage.output / 1000) * pricing.output;
  const reasoningCost = (tokenUsage.reasoning / 1000) * (pricing.reasoning ?? pricing.output);
  return Number((inputCost + outputCost + reasoningCost).toFixed(6));
}

export class CostTracker {
  constructor(private readonly prisma: PrismaClient) {}

  async getCumulativeSessionCost(conversationId: string): Promise<number> {
    const result = await this.prisma.trajectoryLog.aggregate({
      where: {
        run: { dealId: null },
        runId: {
          in: (
            await this.prisma.run.findMany({
              where: { id: { not: undefined } },
              select: { id: true },
            })
          ).map((r) => r.id),
        },
      },
      _sum: { costUsd: true },
    });

    void conversationId;
    return result._sum.costUsd ?? 0;
  }

  async getDailyCost(orgId: string, date?: Date): Promise<number> {
    const day = date ?? new Date();
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const result = await this.prisma.trajectoryLog.aggregate({
      where: {
        orgId,
        createdAt: { gte: start, lt: end },
      },
      _sum: { costUsd: true },
    });

    return result._sum.costUsd ?? 0;
  }
}

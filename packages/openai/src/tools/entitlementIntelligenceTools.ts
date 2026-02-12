import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import {
  computeEntitlementPathPredictions,
  hashJsonSha256,
} from "@entitlement-os/shared";

const skuSchema = z.enum(["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"]);

/**
 * predict_entitlement_path — predicts approval probability and timeline
 * for each available entitlement strategy path in a jurisdiction.
 *
 * This uses persisted precedent outcomes and stores deterministic
 * prediction snapshots so results are auditable and replay-safe.
 */
export const predict_entitlement_path = tool({
  name: "predict_entitlement_path",
  description:
    "Predict probability-of-approval and expected time-to-approval for each entitlement " +
    "strategy path (e.g., by-right, CUP, rezoning, variance) in a jurisdiction. Uses " +
    "historical precedent outcomes and persists prediction snapshots for auditability. " +
    "Use this before choosing an entitlement strategy to compare certainty vs speed.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping."),
    jurisdictionId: z.string().uuid().describe("Jurisdiction to model."),
    dealId: z.string().uuid().nullable().describe("Optional deal scope filter."),
    sku: skuSchema.nullable().describe("Optional SKU filter for strategy relevance."),
    applicationType: z
      .string()
      .nullable()
      .describe("Optional application type filter (e.g., CUP, REZONING, VARIANCE)."),
    lookbackMonths: z
      .number()
      .int()
      .min(1)
      .max(240)
      .nullable()
      .describe("How many months of precedents to include (default 36)."),
    minSampleSize: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .describe("Minimum samples for a strategy path (default 1)."),
    includeBelowMinSample: z
      .boolean()
      .nullable()
      .describe("Whether to include low-sample strategies in output (default true)."),
    persistSnapshot: z
      .boolean()
      .nullable()
      .describe("Whether to persist prediction snapshots (default true)."),
    modelVersion: z
      .string()
      .nullable()
      .describe("Optional model version tag for snapshot lineage."),
  }),
  execute: async ({
    orgId,
    jurisdictionId,
    dealId,
    sku,
    applicationType,
    lookbackMonths,
    minSampleSize,
    includeBelowMinSample,
    persistSnapshot,
    modelVersion,
  }) => {
    const jurisdiction = await prisma.jurisdiction.findFirst({
      where: { id: jurisdictionId, orgId },
      select: { id: true },
    });
    if (!jurisdiction) {
      return JSON.stringify({
        error: "Jurisdiction not found or access denied.",
        jurisdictionId,
      });
    }

    if (dealId) {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, orgId, jurisdictionId },
        select: { id: true },
      });
      if (!deal) {
        return JSON.stringify({
          error: "Deal not found or out of scope for this jurisdiction.",
          dealId,
        });
      }
    }

    const months = Math.max(1, lookbackMonths ?? 36);
    const minSamples = Math.max(1, minSampleSize ?? 1);
    const includeLowSample = includeBelowMinSample ?? true;
    const shouldPersist = persistSnapshot ?? true;
    const version = modelVersion ?? "entitlement_graph_v1";

    const since = new Date();
    since.setMonth(since.getMonth() - months);

    const precedents = await prisma.entitlementOutcomePrecedent.findMany({
      where: {
        orgId,
        jurisdictionId,
        ...(dealId ? { dealId } : {}),
        ...(sku ? { sku } : {}),
        ...(applicationType ? { applicationType } : {}),
        decisionAt: { gte: since },
      },
      orderBy: [
        { decisionAt: "desc" },
        { createdAt: "desc" },
      ],
    });

    const inputHash = hashJsonSha256({
      jurisdictionId,
      dealId: dealId ?? null,
      sku: sku ?? null,
      applicationType: applicationType ?? null,
      lookbackMonths: months,
      minSampleSize: minSamples,
      includeBelowMinSample: includeLowSample,
      modelVersion: version,
      precedentFingerprint: precedents.map((precedent) => ({
        id: precedent.id,
        updatedAt: precedent.updatedAt.toISOString(),
      })),
    });

    const predictions = computeEntitlementPathPredictions(
      precedents.map((precedent) => ({
        strategyKey: precedent.strategyKey,
        strategyLabel: precedent.strategyLabel,
        decision: precedent.decision,
        timelineDays: precedent.timelineDays,
        submittedAt: precedent.submittedAt,
        decisionAt: precedent.decisionAt,
        confidence: Number(precedent.confidence),
        riskFlags: precedent.riskFlags,
      })),
      {
        minSampleSize: minSamples,
        includeBelowMinSample: includeLowSample,
        modelVersion: version,
      },
    );

    const snapshotIdByStrategy = new Map<string, string>();
    if (shouldPersist) {
      for (const prediction of predictions) {
        const snapshot = await prisma.entitlementPredictionSnapshot.upsert({
          where: {
            orgId_jurisdictionId_strategyKey_inputHash: {
              orgId,
              jurisdictionId,
              strategyKey: prediction.strategyKey,
              inputHash,
            },
          },
          create: {
            orgId,
            jurisdictionId,
            dealId: dealId ?? null,
            strategyKey: prediction.strategyKey,
            strategyLabel: prediction.strategyLabel,
            sku: sku ?? null,
            probabilityApproval: prediction.probabilityApproval,
            probabilityLow: prediction.probabilityLow,
            probabilityHigh: prediction.probabilityHigh,
            expectedDaysP50: prediction.expectedDaysP50,
            expectedDaysP75: prediction.expectedDaysP75,
            expectedDaysP90: prediction.expectedDaysP90,
            sampleSize: prediction.sampleSize,
            modelVersion: version,
            inputHash,
            rationale: prediction.rationale as object,
          },
          update: {
            dealId: dealId ?? undefined,
            strategyLabel: prediction.strategyLabel,
            sku: sku ?? undefined,
            probabilityApproval: prediction.probabilityApproval,
            probabilityLow: prediction.probabilityLow,
            probabilityHigh: prediction.probabilityHigh,
            expectedDaysP50: prediction.expectedDaysP50,
            expectedDaysP75: prediction.expectedDaysP75,
            expectedDaysP90: prediction.expectedDaysP90,
            sampleSize: prediction.sampleSize,
            modelVersion: version,
            rationale: prediction.rationale as object,
          },
        });
        snapshotIdByStrategy.set(prediction.strategyKey, snapshot.id);
      }
    }

    return JSON.stringify({
      jurisdictionId,
      dealId: dealId ?? null,
      sku: sku ?? null,
      applicationType: applicationType ?? null,
      lookbackMonths: months,
      minSampleSize: minSamples,
      includeBelowMinSample: includeLowSample,
      totalPrecedents: precedents.length,
      strategyCount: predictions.length,
      inputHash,
      modelVersion: version,
      predictions: predictions.map((prediction) => ({
        ...prediction,
        snapshotId: snapshotIdByStrategy.get(prediction.strategyKey) ?? null,
      })),
    });
  },
});

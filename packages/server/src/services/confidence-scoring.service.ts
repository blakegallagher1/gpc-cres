import "server-only";

import { prisma } from "@entitlement-os/db";

export interface ConfidenceVector {
  structural_confidence: number;
  source_reliability_score: number;
  cross_memory_agreement_score: number;
  calibration_support_score: number;
  anomaly_score: number;
}

export const DEFAULT_CONFIDENCE_VECTOR: ConfidenceVector = {
  structural_confidence: 0.5,
  source_reliability_score: 0.5,
  cross_memory_agreement_score: 0.5,
  calibration_support_score: 0.5,
  anomaly_score: 0.0,
};

interface ScoringContext {
  orgId: string;
  entityId: string;
  factType: string;
  sourceType: string;
  payloadJson: Record<string, unknown>;
  economicWeight: number;
}

const MIN_CALIBRATION_SAMPLES = 3;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function computeStructuralConfidence(payload: Record<string, unknown>): number {
  const keys = Object.keys(payload);
  if (keys.length === 0) return 0;

  let populated = 0;
  for (const key of keys) {
    const value = payload[key];
    if (value !== null && value !== undefined && value !== "") {
      populated++;
    }
  }
  return clamp01(populated / keys.length);
}

async function computeSourceReliability(orgId: string, sourceType: string): Promise<number> {
  const registry = await prisma.memorySourceRegistry.findFirst({
    where: { orgId, sourceKey: sourceType },
    select: { reliability: true },
  });

  if (registry) return clamp01(registry.reliability);

  const defaults: Record<string, number> = {
    user: 0.8,
    agent: 0.6,
    external: 0.5,
    correction: 0.95,
    document: 0.7,
    cron: 0.4,
  };
  return defaults[sourceType] ?? 0.5;
}

async function computeCrossMemoryAgreement(
  orgId: string,
  entityId: string,
  factType: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const existing = await prisma.memoryVerified.findMany({
    where: { orgId, entityId, factType },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { payloadJson: true },
  });

  if (existing.length === 0) return 0.5;

  let totalComparisons = 0;
  let agreements = 0;

  for (const record of existing) {
    const existingPayload =
      typeof record.payloadJson === "object" && record.payloadJson !== null
        ? (record.payloadJson as Record<string, unknown>)
        : {};

    for (const key of Object.keys(payload)) {
      if (key in existingPayload) {
        totalComparisons++;
        if (JSON.stringify(payload[key]) === JSON.stringify(existingPayload[key])) {
          agreements++;
        }
      }
    }
  }

  if (totalComparisons === 0) return 0.5;
  return clamp01(agreements / totalComparisons);
}

async function computeCalibrationSupport(orgId: string, entityId: string): Promise<number> {
  const entity = await prisma.internalEntity.findFirst({
    where: { id: entityId, orgId },
    select: { type: true },
  });

  const propertyType = entity?.type ?? "property";

  const segment = await prisma.calibrationSegment.findFirst({
    where: { orgId, propertyType },
    orderBy: { sampleN: "desc" },
    select: { sampleN: true, variance: true, mae: true },
  });

  if (!segment || segment.sampleN < MIN_CALIBRATION_SAMPLES) {
    return 0.5;
  }

  const sampleFactor = clamp01(segment.sampleN / (MIN_CALIBRATION_SAMPLES * 4));
  const variancePenalty = segment.variance !== null ? clamp01(1 - segment.variance) : 0.5;

  return clamp01((sampleFactor + variancePenalty) / 2);
}

export async function computeConfidenceVector(
  context: ScoringContext,
): Promise<ConfidenceVector> {
  try {
    const [structural, sourceReliability, agreement, calibration] = await Promise.all([
      Promise.resolve(computeStructuralConfidence(context.payloadJson)),
      computeSourceReliability(context.orgId, context.sourceType),
      computeCrossMemoryAgreement(
        context.orgId,
        context.entityId,
        context.factType,
        context.payloadJson,
      ),
      computeCalibrationSupport(context.orgId, context.entityId),
    ]);

    return {
      structural_confidence: structural,
      source_reliability_score: sourceReliability,
      cross_memory_agreement_score: agreement,
      calibration_support_score: calibration,
      anomaly_score: 0.0,
    };
  } catch {
    return { ...DEFAULT_CONFIDENCE_VECTOR };
  }
}

export function parseConfidenceVector(json: unknown): ConfidenceVector {
  if (!json || typeof json !== "object") return { ...DEFAULT_CONFIDENCE_VECTOR };

  const obj = json as Record<string, unknown>;
  return {
    structural_confidence:
      typeof obj.structural_confidence === "number" ? obj.structural_confidence : 0.5,
    source_reliability_score:
      typeof obj.source_reliability_score === "number" ? obj.source_reliability_score : 0.5,
    cross_memory_agreement_score:
      typeof obj.cross_memory_agreement_score === "number"
        ? obj.cross_memory_agreement_score
        : 0.5,
    calibration_support_score:
      typeof obj.calibration_support_score === "number"
        ? obj.calibration_support_score
        : 0.5,
    anomaly_score: typeof obj.anomaly_score === "number" ? obj.anomaly_score : 0.0,
  };
}

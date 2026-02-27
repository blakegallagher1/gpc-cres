import "server-only";

import { prisma } from "@entitlement-os/db";
import { resolveEntityId } from "@/lib/services/entityResolution";
import { ingestOutcome } from "@/lib/services/calibrationService";

type NumericLike =
  | number
  | string
  | { toString(): string }
  | null
  | undefined;

function numeric(value: NumericLike): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildFinalMetrics(outcome: {
  actualPurchasePrice: NumericLike;
  actualNoiYear1: NumericLike;
  actualExitPrice: NumericLike;
  actualIrr: NumericLike;
  actualEquityMultiple: NumericLike;
  actualHoldPeriodMonths: number | null;
} | null): Record<string, number> {
  if (!outcome) return {};

  const metrics: Record<string, number> = {};

  const purchasePrice = numeric(outcome.actualPurchasePrice);
  if (purchasePrice !== null) metrics.purchase_price = purchasePrice;

  const noi = numeric(outcome.actualNoiYear1);
  if (noi !== null) metrics.noi = noi;

  const exitPrice = numeric(outcome.actualExitPrice);
  if (exitPrice !== null) metrics.exit_price = exitPrice;

  const irr = numeric(outcome.actualIrr);
  if (irr !== null) metrics.irr = irr;

  const equityMultiple = numeric(outcome.actualEquityMultiple);
  if (equityMultiple !== null) metrics.equity_multiple = equityMultiple;

  if (typeof outcome.actualHoldPeriodMonths === "number" && Number.isFinite(outcome.actualHoldPeriodMonths)) {
    metrics.hold_period_months = outcome.actualHoldPeriodMonths;
  }

  return metrics;
}

function buildProjectionSnapshot(
  verifiedProjectionRecords: Array<{ payloadJson: unknown }>,
): Record<string, number> {
  const snapshot: Record<string, number> = {};

  for (const record of verifiedProjectionRecords) {
    const payload =
      record.payloadJson && typeof record.payloadJson === "object"
        ? (record.payloadJson as Record<string, unknown>)
        : {};

    const metricKey = typeof payload.metric_key === "string" ? payload.metric_key.trim() : "";
    const projectedValue = numeric(payload.projected_value as NumericLike);

    if (metricKey.length === 0 || projectedValue === null) continue;
    if (metricKey in snapshot) continue; // newest-first iteration

    snapshot[metricKey] = projectedValue;
  }

  return snapshot;
}

export async function captureOutcomeCalibrationForDealStatusChange(params: {
  orgId: string;
  dealId: string;
  toStatus: string;
}): Promise<void> {
  try {
    if (params.toStatus !== "EXITED" && params.toStatus !== "KILLED") return;

    const deal = await prisma.deal.findFirst({
      where: { id: params.dealId, orgId: params.orgId },
      select: {
        id: true,
        orgId: true,
        createdBy: true,
        parcels: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { address: true, propertyDbId: true },
        },
        outcome: {
          select: {
            id: true,
            dealId: true,
            entityId: true,
            actualPurchasePrice: true,
            actualNoiYear1: true,
            actualExitPrice: true,
            actualIrr: true,
            actualEquityMultiple: true,
            actualHoldPeriodMonths: true,
          },
        },
      },
    });

    if (!deal) return;

    const firstParcel = deal.parcels[0] ?? null;
    const entityId = await resolveEntityId({
      orgId: deal.orgId,
      address: firstParcel?.address ?? null,
      parcelId: firstParcel?.propertyDbId ?? null,
      type: null,
    });

    const verifiedProjections = await prisma.memoryVerified.findMany({
      where: {
        orgId: deal.orgId,
        entityId,
        factType: "projection",
      },
      orderBy: { createdAt: "desc" },
      select: { payloadJson: true },
    });

    const finalMetrics = buildFinalMetrics(
      deal.outcome
        ? {
            actualPurchasePrice: deal.outcome.actualPurchasePrice,
            actualNoiYear1: deal.outcome.actualNoiYear1,
            actualExitPrice: deal.outcome.actualExitPrice,
            actualIrr: deal.outcome.actualIrr,
            actualEquityMultiple: deal.outcome.actualEquityMultiple,
            actualHoldPeriodMonths: deal.outcome.actualHoldPeriodMonths ?? null,
          }
        : null,
    );

    const projectionSnapshot = buildProjectionSnapshot(
      verifiedProjections.map((record) => ({ payloadJson: record.payloadJson })),
    );

    const dealOutcomeId = deal.outcome?.id
      ? deal.outcome.id
      : (
          await prisma.dealOutcome.upsert({
            where: { dealId: deal.id },
            create: {
              dealId: deal.id,
              createdBy: deal.createdBy,
              entityId,
              finalMetrics,
              projectionSnapshot,
            },
            update: {
              entityId,
              finalMetrics,
              projectionSnapshot,
            },
            select: { id: true },
          })
        ).id;

    await prisma.dealOutcome.update({
      where: { id: dealOutcomeId },
      data: {
        entityId,
        finalMetrics,
        projectionSnapshot,
      },
    });

    const existingCalibration = await prisma.calibrationRecord.findFirst({
      where: { orgId: deal.orgId, dealOutcomeId },
      select: { id: true },
    });
    if (existingCalibration) return;

    await ingestOutcome(deal.orgId, dealOutcomeId, entityId, projectionSnapshot, finalMetrics);
  } catch (err) {
    console.error("[outcomeCapture] calibration ingestion failed:", err);
  }
}


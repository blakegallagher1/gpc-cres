import { prisma } from "@entitlement-os/db";
import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { getEntitlementIntelligenceKpis } from "@/lib/services/entitlementIntelligence.service";
import { getNotificationService } from "@/lib/services/notification.service";

type EntitlementKpiSnapshot = Awaited<ReturnType<typeof getEntitlementIntelligenceKpis>>;

export type KpiDriftBreach = "timeline_mae" | "calibration_gap";

export interface KpiDriftEvaluation {
  eligible: boolean;
  breaches: KpiDriftBreach[];
  values: {
    sampleSize: number;
    matchedPredictionCount: number;
    medianTimelineAbsoluteErrorDays: number | null;
    approvalCalibrationGap: number | null;
    medianDecisionDays: number | null;
  };
}

export interface RunEntitlementKpiDriftMonitorInput {
  orgId: string;
  jurisdictionId?: string;
  now?: Date;
}

export interface RunEntitlementKpiDriftMonitorResult {
  success: boolean;
  orgId: string;
  jurisdictionsScanned: number;
  jurisdictionsBreached: number;
  notificationsCreated: number;
  errors: string[];
  duration_ms: number;
  alerts: Array<{
    jurisdictionId: string;
    jurisdictionName: string;
    monitorKey: string;
    breaches: KpiDriftBreach[];
    sampleSize: number;
    matchedPredictionCount: number;
    medianTimelineAbsoluteErrorDays: number | null;
    approvalCalibrationGap: number | null;
    medianDecisionDays: number | null;
  }>;
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatDays(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${Math.round(value)}d`;
}

function formatSignedDecimal(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const normalized = round(value);
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
}

function evaluateKpiDrift(snapshot: EntitlementKpiSnapshot): KpiDriftEvaluation {
  const thresholds = AUTOMATION_CONFIG.intelligenceKpi;
  const sampleSize = snapshot.sampleSize ?? 0;
  const matchedPredictionCount = snapshot.matchedPredictionCount ?? 0;
  const medianTimelineAbsoluteErrorDays = snapshot.medianTimelineAbsoluteErrorDays ?? null;
  const approvalCalibrationGap = snapshot.approvalCalibrationGap ?? null;
  const medianDecisionDays = snapshot.medianDecisionDays ?? null;

  if (sampleSize < thresholds.minSampleSize || matchedPredictionCount < thresholds.minMatchedPredictions) {
    return {
      eligible: false,
      breaches: [],
      values: {
        sampleSize,
        matchedPredictionCount,
        medianTimelineAbsoluteErrorDays,
        approvalCalibrationGap,
        medianDecisionDays,
      },
    };
  }

  const breaches: KpiDriftBreach[] = [];
  if (
    medianTimelineAbsoluteErrorDays !== null
    && medianTimelineAbsoluteErrorDays > thresholds.maxMedianTimelineMaeDays
  ) {
    breaches.push("timeline_mae");
  }
  if (
    approvalCalibrationGap !== null
    && Math.abs(approvalCalibrationGap) > thresholds.maxCalibrationGapAbs
  ) {
    breaches.push("calibration_gap");
  }

  return {
    eligible: true,
    breaches,
    values: {
      sampleSize,
      matchedPredictionCount,
      medianTimelineAbsoluteErrorDays,
      approvalCalibrationGap,
      medianDecisionDays,
    },
  };
}

function buildMonitorKey(jurisdictionId: string, evaluation: KpiDriftEvaluation): string {
  const breaches = [...evaluation.breaches].sort().join(",");
  const mae = evaluation.values.medianTimelineAbsoluteErrorDays;
  const calibration = evaluation.values.approvalCalibrationGap;
  const maeTag = mae === null ? "na" : String(round(mae, 1));
  const calibrationTag = calibration === null ? "na" : String(round(calibration, 4));
  return `${jurisdictionId}|${breaches}|mae:${maeTag}|gap:${calibrationTag}`;
}

function buildAlertTitle(jurisdictionName: string, breaches: KpiDriftBreach[]): string {
  const label = breaches.includes("timeline_mae") && breaches.includes("calibration_gap")
    ? "timeline + calibration drift"
    : breaches.includes("timeline_mae")
      ? "timeline drift"
      : "calibration drift";
  return `Entitlement KPI alert: ${jurisdictionName} ${label}`;
}

function buildAlertBody(params: {
  evaluation: KpiDriftEvaluation;
  jurisdictionName: string;
}): string {
  const thresholds = AUTOMATION_CONFIG.intelligenceKpi;
  const lines: string[] = [
    `${params.jurisdictionName} exceeded entitlement KPI guardrails.`,
    `Median entitlement days: ${formatDays(params.evaluation.values.medianDecisionDays)}`,
    `Timeline MAE: ${formatDays(params.evaluation.values.medianTimelineAbsoluteErrorDays)} (threshold ${thresholds.maxMedianTimelineMaeDays}d)`,
    `Calibration gap: ${formatSignedDecimal(params.evaluation.values.approvalCalibrationGap)} (threshold ±${thresholds.maxCalibrationGapAbs})`,
    `Sample size: ${params.evaluation.values.sampleSize}, matched predictions: ${params.evaluation.values.matchedPredictionCount}.`,
    "Review entitlement predictor assumptions and recent precedent ingestion quality.",
  ];
  return lines.join("\n");
}

export async function runEntitlementKpiDriftMonitor(
  input: RunEntitlementKpiDriftMonitorInput,
): Promise<RunEntitlementKpiDriftMonitorResult> {
  const startedAt = Date.now();
  const now = input.now ?? new Date();
  const thresholds = AUTOMATION_CONFIG.intelligenceKpi;
  const errors: string[] = [];
  const alerts: RunEntitlementKpiDriftMonitorResult["alerts"] = [];
  let notificationsCreated = 0;

  const jurisdictions = await prisma.jurisdiction.findMany({
    where: {
      orgId: input.orgId,
      ...(input.jurisdictionId ? { id: input.jurisdictionId } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
    },
  });

  if (jurisdictions.length === 0) {
    return {
      success: true,
      orgId: input.orgId,
      jurisdictionsScanned: 0,
      jurisdictionsBreached: 0,
      notificationsCreated: 0,
      errors: [],
      duration_ms: Date.now() - startedAt,
      alerts: [],
    };
  }

  const members = await prisma.orgMembership.findMany({
    where: { orgId: input.orgId },
    select: { userId: true },
  });
  const notificationService = getNotificationService();

  for (const jurisdiction of jurisdictions) {
    try {
      const kpis = await getEntitlementIntelligenceKpis({
        orgId: input.orgId,
        jurisdictionId: jurisdiction.id,
        lookbackMonths: thresholds.lookbackMonths,
        snapshotLookbackMonths: thresholds.snapshotLookbackMonths,
        minSampleSize: 1,
        recordLimit: 2_000,
      });

      const evaluation = evaluateKpiDrift(kpis);
      if (!evaluation.eligible || evaluation.breaches.length === 0) {
        continue;
      }

      const monitorKey = buildMonitorKey(jurisdiction.id, evaluation);
      const cooldownStart = new Date(now.getTime() - thresholds.alertCooldownHours * 3_600_000);
      const existing = await prisma.notification.findFirst({
        where: {
          orgId: input.orgId,
          type: "ALERT",
          sourceAgent: "entitlement-kpi-monitor",
          createdAt: { gte: cooldownStart },
          metadata: {
            path: ["monitorKey"],
            equals: monitorKey,
          },
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      const title = buildAlertTitle(jurisdiction.name, evaluation.breaches);
      const body = buildAlertBody({
        evaluation,
        jurisdictionName: jurisdiction.name,
      });

      if (members.length > 0) {
        const notifications = await notificationService.createBatch(
          members.map((member) => ({
            orgId: input.orgId,
            userId: member.userId,
            type: "ALERT" as const,
            title,
            body,
            priority: "HIGH" as const,
            actionUrl: "/command-center",
            sourceAgent: "entitlement-kpi-monitor",
            metadata: {
              monitorKey,
              jurisdictionId: jurisdiction.id,
              jurisdictionName: jurisdiction.name,
              breaches: evaluation.breaches,
              sampleSize: evaluation.values.sampleSize,
              matchedPredictionCount: evaluation.values.matchedPredictionCount,
              medianDecisionDays: evaluation.values.medianDecisionDays,
              medianTimelineAbsoluteErrorDays: evaluation.values.medianTimelineAbsoluteErrorDays,
              approvalCalibrationGap: evaluation.values.approvalCalibrationGap,
              evaluatedAt: now.toISOString(),
              lookbackMonths: thresholds.lookbackMonths,
              snapshotLookbackMonths: thresholds.snapshotLookbackMonths,
            },
          })),
        );
        notificationsCreated += notifications.length;
      }

      alerts.push({
        jurisdictionId: jurisdiction.id,
        jurisdictionName: jurisdiction.name,
        monitorKey,
        breaches: evaluation.breaches,
        sampleSize: evaluation.values.sampleSize,
        matchedPredictionCount: evaluation.values.matchedPredictionCount,
        medianTimelineAbsoluteErrorDays: evaluation.values.medianTimelineAbsoluteErrorDays,
        approvalCalibrationGap: evaluation.values.approvalCalibrationGap,
        medianDecisionDays: evaluation.values.medianDecisionDays,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${jurisdiction.name}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    orgId: input.orgId,
    jurisdictionsScanned: jurisdictions.length,
    jurisdictionsBreached: alerts.length,
    notificationsCreated,
    errors,
    duration_ms: Date.now() - startedAt,
    alerts,
  };
}

export const __testables = {
  evaluateKpiDrift,
  buildMonitorKey,
  buildAlertTitle,
  buildAlertBody,
};

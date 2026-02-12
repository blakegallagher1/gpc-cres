import { prisma } from "@entitlement-os/db";
import type {
  DealStatus,
  EntitlementStrategyPrediction,
  SkuType,
} from "@entitlement-os/shared";

import { AUTOMATION_CONFIG } from "@/lib/automation/config";
import { createAutomationTask } from "@/lib/automation/notifications";
import {
  getEntitlementIntelligenceKpis,
  predictEntitlementStrategies,
} from "@/lib/services/entitlementIntelligence.service";

type EntitlementKpiSnapshot = Awaited<ReturnType<typeof getEntitlementIntelligenceKpis>>;

interface ScopedDealRecord {
  id: string;
  name: string;
  sku: SkuType;
  status: DealStatus;
  jurisdictionId: string;
}

export interface EntitlementStrategyAutopilotInput {
  orgId: string;
  dealId: string;
  jurisdictionId?: string | null;
  lookbackMonths?: number | null;
  snapshotLookbackMonths?: number | null;
  recordLimit?: number | null;
  persistSnapshots?: boolean | null;
}

export interface StrategyAutopilotGuardrailStatus {
  kpiEligible: boolean;
  maeWithinThreshold: boolean;
  calibrationWithinThreshold: boolean;
  predictionExists: boolean;
  recommendationEligible: boolean;
}

export interface StrategyRecommendationCandidate {
  strategyKey: string;
  strategyLabel: string;
  probabilityApproval: number;
  probabilityLow: number;
  probabilityHigh: number;
  expectedDaysP50: number;
  sampleSize: number;
  compositeScore: number;
  approvalScore: number;
  speedScore: number;
}

export interface EntitlementStrategyAutopilotRecommendation {
  status: "recommended" | "hold";
  reasonCode:
    | "recommended"
    | "insufficient_kpi_samples"
    | "kpi_drift_detected"
    | "no_predictions"
    | "low_strategy_confidence";
  guardrails: StrategyAutopilotGuardrailStatus;
  kpis: {
    sampleSize: number;
    matchedPredictionCount: number;
    medianDecisionDays: number | null;
    medianTimelineAbsoluteErrorDays: number | null;
    approvalCalibrationGap: number | null;
  };
  recommendedStrategy: StrategyRecommendationCandidate | null;
  alternatives: StrategyRecommendationCandidate[];
}

export interface RunEntitlementStrategyAutopilotResult {
  success: boolean;
  orgId: string;
  dealId: string;
  jurisdictionId: string;
  dealStatus: DealStatus;
  recommendation: EntitlementStrategyAutopilotRecommendation;
  tasksCreated: number;
  createdTaskIds: string[];
  skippedTaskCreationReason: string | null;
}

export interface RunEntitlementStrategyAutopilotSweepInput {
  orgId: string;
  jurisdictionId?: string | null;
  statuses?: DealStatus[] | null;
  dealLimit?: number | null;
}

export interface RunEntitlementStrategyAutopilotSweepResult {
  success: boolean;
  orgId: string;
  dealsScanned: number;
  dealsRecommended: number;
  tasksCreated: number;
  errors: string[];
  results: RunEntitlementStrategyAutopilotResult[];
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNullableNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function normalizeWeights(approvalWeight: number, speedWeight: number) {
  const safeApproval = Math.max(0, approvalWeight);
  const safeSpeed = Math.max(0, speedWeight);
  const total = safeApproval + safeSpeed;
  if (total <= 0) {
    return { approval: 0.7, speed: 0.3 };
  }
  return {
    approval: safeApproval / total,
    speed: safeSpeed / total,
  };
}

function rankStrategyCandidates(
  predictions: EntitlementStrategyPrediction[],
): StrategyRecommendationCandidate[] {
  if (predictions.length === 0) return [];

  const minDays = Math.min(...predictions.map((item) => item.expectedDaysP50));
  const maxDays = Math.max(...predictions.map((item) => item.expectedDaysP50));
  const dayRange = Math.max(1, maxDays - minDays);
  const weights = normalizeWeights(
    AUTOMATION_CONFIG.entitlementAutopilot.approvalWeight,
    AUTOMATION_CONFIG.entitlementAutopilot.speedWeight,
  );

  return predictions
    .map((prediction) => {
      const approvalScore = Math.min(1, Math.max(0, prediction.probabilityApproval));
      const speedScore = maxDays === minDays
        ? 1
        : Math.min(1, Math.max(0, (maxDays - prediction.expectedDaysP50) / dayRange));
      const compositeScore = round(
        (approvalScore * weights.approval) + (speedScore * weights.speed),
      );

      return {
        strategyKey: prediction.strategyKey,
        strategyLabel: prediction.strategyLabel,
        probabilityApproval: round(prediction.probabilityApproval),
        probabilityLow: round(prediction.probabilityLow),
        probabilityHigh: round(prediction.probabilityHigh),
        expectedDaysP50: prediction.expectedDaysP50,
        sampleSize: prediction.sampleSize,
        compositeScore,
        approvalScore: round(approvalScore),
        speedScore: round(speedScore),
      };
    })
    .sort((a, b) => {
      if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
      if (b.probabilityApproval !== a.probabilityApproval) {
        return b.probabilityApproval - a.probabilityApproval;
      }
      if (a.expectedDaysP50 !== b.expectedDaysP50) return a.expectedDaysP50 - b.expectedDaysP50;
      return b.sampleSize - a.sampleSize;
    });
}

function evaluateGuardrails(
  kpis: EntitlementKpiSnapshot,
  topCandidate: StrategyRecommendationCandidate | null,
): StrategyAutopilotGuardrailStatus {
  const thresholds = AUTOMATION_CONFIG.entitlementAutopilot;
  const sampleSize = kpis.sampleSize ?? 0;
  const matchedPredictionCount = kpis.matchedPredictionCount ?? 0;
  const mae = toNullableNumber(kpis.medianTimelineAbsoluteErrorDays);
  const calibrationGap = toNullableNumber(kpis.approvalCalibrationGap);

  const kpiEligible = sampleSize >= thresholds.minSampleSize
    && matchedPredictionCount >= thresholds.minMatchedPredictions;
  const maeWithinThreshold = mae === null || mae <= thresholds.maxMedianTimelineMaeDays;
  const calibrationWithinThreshold = calibrationGap === null
    || Math.abs(calibrationGap) <= thresholds.maxCalibrationGapAbs;
  const predictionExists = topCandidate !== null;

  const candidateEligible = topCandidate !== null
    && topCandidate.probabilityApproval >= thresholds.minApprovalProbability
    && topCandidate.sampleSize >= thresholds.minStrategySampleSize;

  return {
    kpiEligible,
    maeWithinThreshold,
    calibrationWithinThreshold,
    predictionExists,
    recommendationEligible: kpiEligible
      && maeWithinThreshold
      && calibrationWithinThreshold
      && candidateEligible,
  };
}

function toStagePipelineStep(status: DealStatus): number {
  if (status === "CONCEPT") return 3;
  return 2;
}

async function getScopedDeal(input: {
  orgId: string;
  dealId: string;
  jurisdictionId?: string | null;
}): Promise<ScopedDealRecord> {
  const deal = await prisma.deal.findFirst({
    where: {
      id: input.dealId,
      orgId: input.orgId,
      ...(input.jurisdictionId ? { jurisdictionId: input.jurisdictionId } : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      status: true,
      jurisdictionId: true,
    },
  });

  if (!deal) {
    throw new Error("Deal not found or access denied.");
  }

  return {
    id: deal.id,
    name: deal.name,
    sku: deal.sku as SkuType,
    status: deal.status as DealStatus,
    jurisdictionId: deal.jurisdictionId,
  };
}

function buildRecommendationPayload(params: {
  kpis: EntitlementKpiSnapshot;
  rankedCandidates: StrategyRecommendationCandidate[];
}): EntitlementStrategyAutopilotRecommendation {
  const topCandidate = params.rankedCandidates[0] ?? null;
  const guardrails = evaluateGuardrails(params.kpis, topCandidate);

  let reasonCode: EntitlementStrategyAutopilotRecommendation["reasonCode"] = "recommended";
  let status: EntitlementStrategyAutopilotRecommendation["status"] = "recommended";
  if (!guardrails.kpiEligible) {
    status = "hold";
    reasonCode = "insufficient_kpi_samples";
  } else if (!guardrails.maeWithinThreshold || !guardrails.calibrationWithinThreshold) {
    status = "hold";
    reasonCode = "kpi_drift_detected";
  } else if (!guardrails.predictionExists) {
    status = "hold";
    reasonCode = "no_predictions";
  } else if (!guardrails.recommendationEligible) {
    status = "hold";
    reasonCode = "low_strategy_confidence";
  }

  return {
    status,
    reasonCode,
    guardrails,
    kpis: {
      sampleSize: params.kpis.sampleSize ?? 0,
      matchedPredictionCount: params.kpis.matchedPredictionCount ?? 0,
      medianDecisionDays: toNullableNumber(params.kpis.medianDecisionDays),
      medianTimelineAbsoluteErrorDays: toNullableNumber(params.kpis.medianTimelineAbsoluteErrorDays),
      approvalCalibrationGap: toNullableNumber(params.kpis.approvalCalibrationGap),
    },
    recommendedStrategy: status === "recommended" ? topCandidate : null,
    alternatives: params.rankedCandidates.slice(0, 5),
  };
}

function buildAutopilotSummaryDescription(params: {
  dealName: string;
  recommendation: EntitlementStrategyAutopilotRecommendation;
}): string {
  const top = params.recommendation.recommendedStrategy;
  const lines = [
    `Deal: ${params.dealName}`,
    `Status: ${params.recommendation.status.toUpperCase()} (${params.recommendation.reasonCode})`,
    `KPI sample size: ${params.recommendation.kpis.sampleSize}`,
    `Matched predictions: ${params.recommendation.kpis.matchedPredictionCount}`,
    `Timeline MAE: ${params.recommendation.kpis.medianTimelineAbsoluteErrorDays ?? "n/a"} days`,
    `Calibration gap: ${params.recommendation.kpis.approvalCalibrationGap ?? "n/a"}`,
  ];

  if (top) {
    lines.push(
      "",
      `Recommended strategy: ${top.strategyLabel} (${top.strategyKey})`,
      `Approval probability: ${(top.probabilityApproval * 100).toFixed(1)}%`,
      `Expected decision timeline (P50): ${top.expectedDaysP50} days`,
      `Strategy sample size: ${top.sampleSize}`,
      `Composite score: ${top.compositeScore}`,
    );
  }

  return lines.join("\n");
}

async function maybeMaterializeAutopilotTasks(input: {
  orgId: string;
  deal: ScopedDealRecord;
  recommendation: EntitlementStrategyAutopilotRecommendation;
}): Promise<{
  createdTaskIds: string[];
  skippedReason: string | null;
}> {
  if (input.recommendation.status !== "recommended" || !input.recommendation.recommendedStrategy) {
    return {
      createdTaskIds: [],
      skippedReason: "recommendation_not_actionable",
    };
  }

  if (input.deal.status !== "PREAPP" && input.deal.status !== "CONCEPT") {
    return {
      createdTaskIds: [],
      skippedReason: "deal_stage_not_targeted",
    };
  }

  const marker = "Entitlement strategy autopilot";
  const existing = await prisma.task.findFirst({
    where: {
      orgId: input.orgId,
      dealId: input.deal.id,
      status: { in: ["TODO", "IN_PROGRESS"] },
      title: { contains: marker },
    },
    select: { id: true },
  });

  if (existing) {
    return {
      createdTaskIds: [],
      skippedReason: "open_autopilot_tasks_exist",
    };
  }

  const top = input.recommendation.recommendedStrategy;
  const pipelineStep = toStagePipelineStep(input.deal.status);
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + AUTOMATION_CONFIG.entitlementAutopilot.defaultTaskDueInDays);

  const summaryTask = await createAutomationTask({
    orgId: input.orgId,
    dealId: input.deal.id,
    type: "advancement_suggestion",
    title: `${marker}: confirm ${top.strategyLabel} path`,
    description: buildAutopilotSummaryDescription({
      dealName: input.deal.name,
      recommendation: input.recommendation,
    }),
    pipelineStep,
    dueAt,
  });

  const executionChecklist = await createAutomationTask({
    orgId: input.orgId,
    dealId: input.deal.id,
    type: "advancement_suggestion",
    title: `${marker}: execute ${top.strategyLabel} checklist`,
    description:
      `Execute the recommended entitlement path for ${input.deal.name}.\n\n` +
      `1) Confirm submission package requirements for ${top.strategyLabel}.\n` +
      "2) Build hearing timeline milestones and owner assignments.\n" +
      "3) Capture conditions and evidence links in the entitlement graph.",
    pipelineStep,
    dueAt,
  });

  return {
    createdTaskIds: [summaryTask.id, executionChecklist.id],
    skippedReason: null,
  };
}

export async function recommendEntitlementStrategy(
  input: EntitlementStrategyAutopilotInput,
): Promise<{
  orgId: string;
  dealId: string;
  jurisdictionId: string;
  dealStatus: DealStatus;
  dealSku: SkuType;
  recommendation: EntitlementStrategyAutopilotRecommendation;
}> {
  const deal = await getScopedDeal(input);
  const lookbackMonths = Math.max(
    1,
    input.lookbackMonths ?? AUTOMATION_CONFIG.entitlementAutopilot.lookbackMonths,
  );
  const snapshotLookbackMonths = Math.max(
    lookbackMonths,
    input.snapshotLookbackMonths ?? AUTOMATION_CONFIG.entitlementAutopilot.snapshotLookbackMonths,
  );
  const recordLimit = Math.max(1, Math.min(5_000, input.recordLimit ?? 1_500));
  const persistSnapshots = input.persistSnapshots ?? true;

  const [predictionResult, kpis] = await Promise.all([
    predictEntitlementStrategies({
      orgId: input.orgId,
      jurisdictionId: deal.jurisdictionId,
      dealId: null,
      sku: deal.sku,
      applicationType: null,
      lookbackMonths,
      minSampleSize: 1,
      includeBelowMinSample: true,
      persistSnapshots,
      modelVersion: "entitlement_graph_v1",
    }),
    getEntitlementIntelligenceKpis({
      orgId: input.orgId,
      jurisdictionId: deal.jurisdictionId,
      dealId: null,
      sku: deal.sku,
      applicationType: null,
      hearingBody: null,
      strategyKeys: null,
      lookbackMonths,
      snapshotLookbackMonths,
      minSampleSize: 1,
      recordLimit,
    }),
  ]);

  const rankedCandidates = rankStrategyCandidates(predictionResult.predictions);
  const recommendation = buildRecommendationPayload({
    kpis,
    rankedCandidates,
  });

  return {
    orgId: input.orgId,
    dealId: deal.id,
    jurisdictionId: deal.jurisdictionId,
    dealStatus: deal.status,
    dealSku: deal.sku,
    recommendation,
  };
}

export async function runEntitlementStrategyAutopilot(
  input: EntitlementStrategyAutopilotInput & {
    materializeTasks?: boolean;
  },
): Promise<RunEntitlementStrategyAutopilotResult> {
  const recommendationResult = await recommendEntitlementStrategy(input);

  let createdTaskIds: string[] = [];
  let skippedTaskCreationReason: string | null = null;

  if (input.materializeTasks ?? true) {
    const deal = await getScopedDeal({
      orgId: input.orgId,
      dealId: input.dealId,
      jurisdictionId: input.jurisdictionId,
    });
    const materialization = await maybeMaterializeAutopilotTasks({
      orgId: input.orgId,
      deal,
      recommendation: recommendationResult.recommendation,
    });
    createdTaskIds = materialization.createdTaskIds;
    skippedTaskCreationReason = materialization.skippedReason;
  } else {
    skippedTaskCreationReason = "materialization_disabled";
  }

  return {
    success: true,
    orgId: input.orgId,
    dealId: recommendationResult.dealId,
    jurisdictionId: recommendationResult.jurisdictionId,
    dealStatus: recommendationResult.dealStatus,
    recommendation: recommendationResult.recommendation,
    tasksCreated: createdTaskIds.length,
    createdTaskIds,
    skippedTaskCreationReason,
  };
}

export async function runEntitlementStrategyAutopilotSweep(
  input: RunEntitlementStrategyAutopilotSweepInput,
): Promise<RunEntitlementStrategyAutopilotSweepResult> {
  const targetStatuses = input.statuses && input.statuses.length > 0
    ? input.statuses
    : (["PREAPP", "CONCEPT"] as DealStatus[]);
  const dealLimit = Math.max(1, Math.min(500, input.dealLimit ?? 100));

  const deals = await prisma.deal.findMany({
    where: {
      orgId: input.orgId,
      ...(input.jurisdictionId ? { jurisdictionId: input.jurisdictionId } : {}),
      status: { in: targetStatuses },
    },
    orderBy: { updatedAt: "desc" },
    take: dealLimit,
    select: {
      id: true,
      jurisdictionId: true,
    },
  });

  const results: RunEntitlementStrategyAutopilotResult[] = [];
  const errors: string[] = [];
  let dealsRecommended = 0;
  let tasksCreated = 0;

  for (const deal of deals) {
    try {
      const result = await runEntitlementStrategyAutopilot({
        orgId: input.orgId,
        dealId: deal.id,
        jurisdictionId: deal.jurisdictionId,
        materializeTasks: true,
      });
      results.push(result);
      if (result.recommendation.status === "recommended") {
        dealsRecommended += 1;
      }
      tasksCreated += result.tasksCreated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${deal.id}: ${message}`);
    }
  }

  return {
    success: errors.length === 0,
    orgId: input.orgId,
    dealsScanned: deals.length,
    dealsRecommended,
    tasksCreated,
    errors,
    results,
  };
}

export const __testables = {
  rankStrategyCandidates,
  evaluateGuardrails,
  buildRecommendationPayload,
};

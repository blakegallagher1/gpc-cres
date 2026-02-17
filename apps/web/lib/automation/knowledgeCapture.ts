import { prisma } from "@entitlement-os/db";
import type { AutomationEvent } from "./events";
import { AUTOMATION_CONFIG } from "./config";
import {
  deleteKnowledge,
  ingestKnowledge,
  type KnowledgeContentType,
} from "@/lib/services/knowledgeBase.service";

type NumericLike = number | string | { toString(): string } | null | undefined;

function numeric(value: NumericLike): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
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

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function extractPredictedIrr(output: Record<string, unknown> | null): number | null {
  if (!output) return null;
  const topLevel = numeric(
    output.predicted_irr as NumericLike ??
      output.predictedIrr as NumericLike ??
      output.projected_irr as NumericLike ??
      output.projectedIrr as NumericLike,
  );
  if (topLevel !== null) return topLevel;

  const triage =
    output.triage && typeof output.triage === "object"
      ? (output.triage as Record<string, unknown>)
      : null;
  if (!triage) return null;

  return numeric(
    triage.predicted_irr as NumericLike ??
      triage.projected_irr as NumericLike ??
      triage.irr as NumericLike,
  );
}

function extractPredictedTimelineDays(
  output: Record<string, unknown> | null,
  fallback: number | null,
): number | null {
  if (fallback !== null) return fallback;
  if (!output) return null;

  const topLevel = numeric(
    output.predicted_timeline_days as NumericLike ??
      output.predictedTimelineDays as NumericLike ??
      output.timeline_days as NumericLike ??
      output.timelineDays as NumericLike,
  );
  if (topLevel !== null) return Math.round(topLevel);

  const triage =
    output.triage && typeof output.triage === "object"
      ? (output.triage as Record<string, unknown>)
      : null;
  if (!triage) return null;

  const nested = numeric(
    triage.predicted_timeline_days as NumericLike ??
      triage.timeline_days as NumericLike,
  );
  return nested === null ? null : Math.round(nested);
}

function buildRiskSummary(
  risks: Array<{
    category: string | null;
    title: string | null;
    description: string | null;
    severity: string | null;
    status: string | null;
  }>,
): string {
  if (risks.length === 0) {
    return "No tracked risk records.";
  }

  const lines = risks.map((risk, index) => {
    const title = risk.title ?? risk.description ?? "Unnamed risk";
    const severity = risk.severity ?? "unknown";
    const status = risk.status ?? "unknown";
    const category = risk.category ?? "uncategorized";
    return `${index + 1}. [${severity}] ${title} (${category}, ${status})`;
  });
  return lines.join("\n");
}

export async function handleKnowledgeCapture(event: AutomationEvent): Promise<void> {
  if (event.type !== "deal.statusChanged") return;
  if (event.to !== "EXITED" && event.to !== "KILLED") return;

  const deal = await prisma.deal.findFirst({
    where: {
      id: event.dealId,
      orgId: event.orgId,
    },
    select: {
      id: true,
      orgId: true,
      name: true,
      sku: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      jurisdiction: { select: { name: true } },
      entitlementPath: { select: { recommendedStrategy: true } },
      outcome: {
        select: {
          actualIrr: true,
          actualEquityMultiple: true,
          actualHoldPeriodMonths: true,
          exitDate: true,
          killReason: true,
          killWasCorrect: true,
        },
      },
      risks: {
        select: {
          category: true,
          title: true,
          description: true,
          severity: true,
          status: true,
        },
      },
    },
  });

  if (!deal) return;

  const [triageRun, predictionSnapshot] = await Promise.all([
    prisma.run.findFirst({
      where: {
        orgId: event.orgId,
        dealId: event.dealId,
        runType: "TRIAGE",
      },
      orderBy: { startedAt: "desc" },
      select: { outputJson: true },
    }),
    prisma.entitlementPredictionSnapshot.findFirst({
      where: {
        orgId: event.orgId,
        dealId: event.dealId,
      },
      orderBy: { createdAt: "desc" },
      select: {
        expectedDaysP50: true,
      },
    }),
  ]);

  const triageOutput =
    triageRun?.outputJson && typeof triageRun.outputJson === "object"
      ? (triageRun.outputJson as Record<string, unknown>)
      : null;

  const predictedIrr = extractPredictedIrr(triageOutput);
  const predictedTimelineDays = extractPredictedTimelineDays(
    triageOutput,
    predictionSnapshot?.expectedDaysP50 ?? null,
  );

  const actualIrr = numeric(deal.outcome?.actualIrr);
  const actualEquityMultiple = numeric(deal.outcome?.actualEquityMultiple);

  const actualTimelineDays =
    deal.outcome?.actualHoldPeriodMonths ??
    (deal.outcome?.exitDate
      ? daysBetween(deal.createdAt, deal.outcome.exitDate)
      : event.to === "KILLED"
      ? daysBetween(deal.createdAt, deal.updatedAt)
      : null);

  const irrVariancePct =
    predictedIrr !== null && actualIrr !== null && predictedIrr !== 0
      ? ((actualIrr - predictedIrr) / Math.abs(predictedIrr)) * 100
      : null;
  const timelineVarianceDays =
    predictedTimelineDays !== null && actualTimelineDays !== null
      ? actualTimelineDays - predictedTimelineDays
      : null;

  const parish = deal.jurisdiction?.name ?? "Unknown";
  const strategy = deal.entitlementPath?.recommendedStrategy ?? "Unknown";
  const sourceId = `deal-outcome:${deal.id}:${event.to.toLowerCase()}`;

  const content = [
    `Deal Outcome Record: ${deal.name}`,
    "",
    `- Status: ${event.to}`,
    `- SKU: ${deal.sku}`,
    `- Parish: ${parish}`,
    `- Strategy: ${strategy}`,
    "",
    "Predicted vs Actual",
    `- Predicted IRR: ${predictedIrr !== null ? predictedIrr.toFixed(4) : "N/A"}`,
    `- Actual IRR: ${actualIrr !== null ? actualIrr.toFixed(4) : "N/A"}`,
    `- IRR Variance (%): ${irrVariancePct !== null ? irrVariancePct.toFixed(2) : "N/A"}`,
    `- Predicted Timeline (days): ${predictedTimelineDays !== null ? String(predictedTimelineDays) : "N/A"}`,
    `- Actual Timeline (days): ${actualTimelineDays !== null ? String(actualTimelineDays) : "N/A"}`,
    `- Timeline Variance (days): ${timelineVarianceDays !== null ? String(timelineVarianceDays) : "N/A"}`,
    `- Actual Equity Multiple: ${actualEquityMultiple !== null ? actualEquityMultiple.toFixed(4) : "N/A"}`,
    "",
    "Risk Materializations",
    buildRiskSummary(deal.risks),
    "",
    "Outcome Notes",
    `- Kill Reason: ${deal.outcome?.killReason ?? "N/A"}`,
    `- Kill Correctness: ${
      deal.outcome?.killWasCorrect === null || deal.outcome?.killWasCorrect === undefined
        ? "N/A"
        : deal.outcome.killWasCorrect
        ? "Correct"
        : "Incorrect"
    }`,
  ].join("\n");

  const metadata = {
    orgId: deal.orgId,
    dealId: deal.id,
    dealName: deal.name,
    status: event.to,
    parish,
    sku: deal.sku,
    strategy,
    predictedIrr,
    actualIrr,
    irrVariancePct,
    predictedTimelineDays,
    actualTimelineDays,
    timelineVarianceDays,
    riskCount: deal.risks.length,
    sourceAgent: "automation.knowledgeCapture",
    toolName: "store_knowledge_entry",
  };

  if (AUTOMATION_CONFIG.knowledgeCapture.dedupeBeforeWrite) {
    await deleteKnowledge(sourceId);
  }

  await ingestKnowledge(
    "outcome_record" as KnowledgeContentType,
    sourceId,
    content,
    metadata,
  );
}

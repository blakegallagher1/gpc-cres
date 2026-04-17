import { prisma } from "@entitlement-os/db";
import { logger } from "../logger";
import { computeDealFitScore } from "../deals/deal-fit-score.service";
import { loadInvestmentCriteria } from "../services/investment-criteria.service";

export type PortfolioAlertCategory =
  | "deadline"
  | "financial_stale"
  | "stage_stuck"
  | "fit_drift"
  | "approval_pending";

export type PortfolioAlertSeverity = "info" | "warn" | "urgent";

export interface RaisedAlert {
  dealId: string | null;
  category: PortfolioAlertCategory;
  severity: PortfolioAlertSeverity;
  title: string;
  summary: string;
  detail: Record<string, unknown>;
  fingerprint: string;
}

export interface PortfolioWatcherRunResult {
  orgsScanned: number;
  dealsScanned: number;
  alertsUpserted: number;
  alertsResolved: number;
  durationMs: number;
}

const STAGE_STUCK_DAYS = 30;
const FINANCIAL_STALE_DAYS = 60;
const DEADLINE_WARN_DAYS = 14;
const DEADLINE_URGENT_DAYS = 3;

const ACTIVE_STAGES = new Set([
  "ORIGINATION",
  "SCREENING",
  "UNDERWRITING",
  "DUE_DILIGENCE",
  "CONTRACTING",
  "EXECUTION",
  "ASSET_MANAGEMENT",
]);

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function deadlineFingerprint(dealId: string, deadlineIso: string, title: string): string {
  return `deadline:${dealId}:${deadlineIso.slice(0, 10)}:${title.slice(0, 80)}`;
}

function stageStuckFingerprint(dealId: string, stageKey: string): string {
  return `stage_stuck:${dealId}:${stageKey}`;
}

function financialStaleFingerprint(dealId: string): string {
  return `financial_stale:${dealId}`;
}

function fitDriftFingerprint(dealId: string, verdict: string): string {
  return `fit_drift:${dealId}:${verdict}`;
}

function approvalPendingFingerprint(approvalId: string): string {
  return `approval_pending:${approvalId}`;
}

interface DealSummary {
  id: string;
  orgId: string;
  name: string;
  currentStageKey: string | null;
  updatedAt: Date;
  targetCloseDate: Date | null;
  financialModelAssumptions: unknown;
  financialModelScenarios: unknown;
}

async function scanDeadlinesForDeal(deal: DealSummary, now: Date): Promise<RaisedAlert[]> {
  const alerts: RaisedAlert[] = [];
  const horizon = new Date(now.getTime() + DEADLINE_WARN_DAYS * 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: {
      orgId: deal.orgId,
      dealId: deal.id,
      status: { in: ["TODO", "IN_PROGRESS"] },
      dueAt: { not: null, lte: horizon },
    },
    select: { id: true, title: true, dueAt: true },
    take: 10,
  });

  for (const task of tasks) {
    if (!task.dueAt) continue;
    const days = daysBetween(task.dueAt, now);
    const severity: PortfolioAlertSeverity =
      days < 0 ? "urgent" : days <= DEADLINE_URGENT_DAYS ? "urgent" : "warn";
    const when =
      days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "due today" : `in ${days}d`;
    alerts.push({
      dealId: deal.id,
      category: "deadline",
      severity,
      title: `Task due ${when}: ${task.title}`,
      summary: `Deal "${deal.name}" has an open task due ${task.dueAt
        .toISOString()
        .slice(0, 10)}.`,
      detail: { taskId: task.id, dueAt: task.dueAt.toISOString(), days },
      fingerprint: deadlineFingerprint(deal.id, task.dueAt.toISOString(), task.title),
    });
  }

  if (deal.targetCloseDate && deal.targetCloseDate <= horizon) {
    const days = daysBetween(deal.targetCloseDate, now);
    const severity: PortfolioAlertSeverity =
      days < 0 ? "urgent" : days <= DEADLINE_URGENT_DAYS ? "urgent" : "warn";
    const when =
      days < 0 ? `${Math.abs(days)}d past` : days === 0 ? "today" : `in ${days}d`;
    alerts.push({
      dealId: deal.id,
      category: "deadline",
      severity,
      title: `Target close ${when}`,
      summary: `Deal "${deal.name}" target-close date is ${deal.targetCloseDate
        .toISOString()
        .slice(0, 10)}.`,
      detail: {
        targetCloseDate: deal.targetCloseDate.toISOString(),
        days,
      },
      fingerprint: deadlineFingerprint(
        deal.id,
        deal.targetCloseDate.toISOString(),
        "target-close",
      ),
    });
  }

  return alerts;
}

async function scanStageStuck(deal: DealSummary, now: Date): Promise<RaisedAlert | null> {
  if (!deal.currentStageKey || !ACTIVE_STAGES.has(deal.currentStageKey)) return null;

  const lastMove = await prisma.dealStageHistory.findFirst({
    where: { orgId: deal.orgId, dealId: deal.id },
    orderBy: { changedAt: "desc" },
    select: { changedAt: true },
  });

  const anchor = lastMove?.changedAt ?? deal.updatedAt;
  const daysInStage = daysBetween(now, anchor);
  if (daysInStage < STAGE_STUCK_DAYS) return null;

  return {
    dealId: deal.id,
    category: "stage_stuck",
    severity: daysInStage > STAGE_STUCK_DAYS * 2 ? "urgent" : "warn",
    title: `Stuck in ${deal.currentStageKey} for ${daysInStage}d`,
    summary: `Deal "${deal.name}" hasn't moved from ${deal.currentStageKey} since ${anchor
      .toISOString()
      .slice(0, 10)}.`,
    detail: {
      stageKey: deal.currentStageKey,
      daysInStage,
      since: anchor.toISOString(),
    },
    fingerprint: stageStuckFingerprint(deal.id, deal.currentStageKey),
  };
}

function scanFinancialStale(deal: DealSummary, now: Date): RaisedAlert | null {
  const hasFinancials =
    Boolean(deal.financialModelAssumptions) ||
    (Array.isArray(deal.financialModelScenarios) && deal.financialModelScenarios.length > 0);
  if (!hasFinancials) return null;
  if (daysBetween(now, deal.updatedAt) < FINANCIAL_STALE_DAYS) return null;
  return {
    dealId: deal.id,
    category: "financial_stale",
    severity: "info",
    title: `Financial model stale (${daysBetween(now, deal.updatedAt)}d)`,
    summary: `Deal "${deal.name}" financial model has not been touched in over ${FINANCIAL_STALE_DAYS} days.`,
    detail: { lastTouchedAt: deal.updatedAt.toISOString() },
    fingerprint: financialStaleFingerprint(deal.id),
  };
}

async function scanFitDrift(deal: DealSummary): Promise<RaisedAlert | null> {
  try {
    const criteria = await loadInvestmentCriteria(deal.orgId);
    const fit = await computeDealFitScore(deal.orgId, deal.id, criteria);
    if (!fit) return null;
    if (fit.verdict !== "miss" || fit.hardFailures.length === 0) return null;
    return {
      dealId: deal.id,
      category: "fit_drift",
      severity: "warn",
      title: `Fit score regressed to MISS`,
      summary: `Deal "${deal.name}" fails ${fit.hardFailures.length} hard gate(s). Score ${fit.score}/100.`,
      detail: {
        score: fit.score,
        verdict: fit.verdict,
        hardFailures: fit.hardFailures.map((g) => ({
          dimension: g.dimension,
          observed: g.observed,
          reason: g.reason,
        })),
      },
      fingerprint: fitDriftFingerprint(deal.id, fit.verdict),
    };
  } catch (error) {
    logger.warn("Fit drift scan failed", {
      dealId: deal.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function scanApprovalPending(orgId: string): Promise<RaisedAlert[]> {
  const pending = await prisma.approvalRequest.findMany({
    where: { status: "pending", deal: { orgId } },
    select: {
      id: true,
      dealId: true,
      stageFrom: true,
      stageTo: true,
      createdAt: true,
      deal: { select: { name: true } },
    },
    take: 20,
  });
  return pending.map((req) => {
    const days = daysBetween(new Date(), req.createdAt);
    return {
      dealId: req.dealId,
      category: "approval_pending" as const,
      severity: (days > 7 ? "urgent" : "warn") as PortfolioAlertSeverity,
      title: `Approval pending ${days}d: ${req.stageFrom} → ${req.stageTo}`,
      summary: `"${req.deal.name}" is waiting on human approval to advance from ${req.stageFrom} to ${req.stageTo}.`,
      detail: {
        approvalRequestId: req.id,
        stageFrom: req.stageFrom,
        stageTo: req.stageTo,
        daysOpen: days,
      },
      fingerprint: approvalPendingFingerprint(req.id),
    };
  });
}

async function upsertAlert(orgId: string, alert: RaisedAlert): Promise<void> {
  await prisma.portfolioAlert.upsert({
    where: { orgId_fingerprint: { orgId, fingerprint: alert.fingerprint } },
    create: {
      orgId,
      dealId: alert.dealId,
      category: alert.category,
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      detail: alert.detail as object,
      fingerprint: alert.fingerprint,
    },
    update: {
      lastSeenAt: new Date(),
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      detail: alert.detail as object,
      resolvedAt: null,
    },
  });
}

async function resolveMissingAlerts(
  orgId: string,
  seenFingerprints: Set<string>,
  runStartedAt: Date,
): Promise<number> {
  const result = await prisma.portfolioAlert.updateMany({
    where: {
      orgId,
      resolvedAt: null,
      lastSeenAt: { lt: runStartedAt },
      fingerprint: { notIn: Array.from(seenFingerprints) },
    },
    data: { resolvedAt: new Date() },
  });
  return result.count;
}

export async function runPortfolioWatcherForOrg(orgId: string): Promise<{
  dealsScanned: number;
  alertsUpserted: number;
  alertsResolved: number;
}> {
  const now = new Date();
  const runStartedAt = new Date(now.getTime() - 1000);

  const deals = await prisma.deal.findMany({
    where: {
      orgId,
      OR: [
        { currentStageKey: { in: Array.from(ACTIVE_STAGES) as never } },
        { status: { notIn: ["CLOSED_WON" as never, "CLOSED_LOST" as never] } },
      ],
    },
    select: {
      id: true,
      orgId: true,
      name: true,
      currentStageKey: true,
      updatedAt: true,
      targetCloseDate: true,
      financialModelAssumptions: true,
      financialModelScenarios: true,
    },
    take: 500,
  });

  const seenFingerprints = new Set<string>();
  let alertsUpserted = 0;

  for (const deal of deals) {
    const dealSummary: DealSummary = {
      id: deal.id,
      orgId: deal.orgId,
      name: deal.name,
      currentStageKey: deal.currentStageKey ?? null,
      updatedAt: deal.updatedAt,
      targetCloseDate: deal.targetCloseDate,
      financialModelAssumptions: deal.financialModelAssumptions,
      financialModelScenarios: deal.financialModelScenarios,
    };

    const raised: RaisedAlert[] = [];
    raised.push(...(await scanDeadlinesForDeal(dealSummary, now)));
    const stageAlert = await scanStageStuck(dealSummary, now);
    if (stageAlert) raised.push(stageAlert);
    const staleAlert = scanFinancialStale(dealSummary, now);
    if (staleAlert) raised.push(staleAlert);
    const fitAlert = await scanFitDrift(dealSummary);
    if (fitAlert) raised.push(fitAlert);

    for (const alert of raised) {
      await upsertAlert(orgId, alert);
      seenFingerprints.add(alert.fingerprint);
      alertsUpserted += 1;
    }
  }

  for (const alert of await scanApprovalPending(orgId)) {
    await upsertAlert(orgId, alert);
    seenFingerprints.add(alert.fingerprint);
    alertsUpserted += 1;
  }

  const alertsResolved = await resolveMissingAlerts(orgId, seenFingerprints, runStartedAt);

  return { dealsScanned: deals.length, alertsUpserted, alertsResolved };
}

export async function runPortfolioWatcher(): Promise<PortfolioWatcherRunResult> {
  const startedAt = Date.now();
  const orgs = await prisma.org.findMany({ select: { id: true } });
  let dealsScanned = 0;
  let alertsUpserted = 0;
  let alertsResolved = 0;

  for (const org of orgs) {
    try {
      const result = await runPortfolioWatcherForOrg(org.id);
      dealsScanned += result.dealsScanned;
      alertsUpserted += result.alertsUpserted;
      alertsResolved += result.alertsResolved;
    } catch (error) {
      logger.warn("Portfolio watcher org scan failed", {
        orgId: org.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    orgsScanned: orgs.length,
    dealsScanned,
    alertsUpserted,
    alertsResolved,
    durationMs: Date.now() - startedAt,
  };
}

export interface PortfolioAlertRecord {
  id: string;
  dealId: string | null;
  category: PortfolioAlertCategory;
  severity: PortfolioAlertSeverity;
  title: string;
  summary: string;
  detail: Record<string, unknown>;
  firstSeenAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  dealName: string | null;
}

export async function listPortfolioAlerts(
  orgId: string,
  options: { includeAcknowledged?: boolean; includeResolved?: boolean; limit?: number } = {},
): Promise<PortfolioAlertRecord[]> {
  const { includeAcknowledged = false, includeResolved = false, limit = 50 } = options;
  const now = new Date();

  const rows = await prisma.portfolioAlert.findMany({
    where: {
      orgId,
      ...(includeResolved ? {} : { resolvedAt: null }),
      ...(includeAcknowledged ? {} : { acknowledgedAt: null }),
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
    },
    orderBy: [{ severity: "desc" }, { firstSeenAt: "desc" }],
    take: limit,
  });

  if (rows.length === 0) return [];

  const dealIds = Array.from(
    new Set(rows.map((r) => r.dealId).filter((v): v is string => Boolean(v))),
  );
  const deals = dealIds.length
    ? await prisma.deal.findMany({
        where: { orgId, id: { in: dealIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(deals.map((d) => [d.id, d.name]));

  return rows.map((row) => ({
    id: row.id,
    dealId: row.dealId,
    category: row.category as PortfolioAlertCategory,
    severity: row.severity as PortfolioAlertSeverity,
    title: row.title,
    summary: row.summary,
    detail: (row.detail ?? {}) as Record<string, unknown>,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy ?? null,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    dealName: row.dealId ? nameById.get(row.dealId) ?? null : null,
  }));
}

export async function acknowledgePortfolioAlert(
  orgId: string,
  alertId: string,
  userId: string,
): Promise<void> {
  const row = await prisma.portfolioAlert.findFirst({
    where: { id: alertId, orgId },
    select: { id: true },
  });
  if (!row) throw new Error("Alert not found");
  await prisma.portfolioAlert.update({
    where: { id: alertId },
    data: { acknowledgedAt: new Date(), acknowledgedBy: userId },
  });
}

export async function snoozePortfolioAlert(
  orgId: string,
  alertId: string,
  untilIso: string,
): Promise<void> {
  const until = new Date(untilIso);
  if (Number.isNaN(until.getTime())) throw new Error("Invalid snooze date");
  const row = await prisma.portfolioAlert.findFirst({
    where: { id: alertId, orgId },
    select: { id: true },
  });
  if (!row) throw new Error("Alert not found");
  await prisma.portfolioAlert.update({
    where: { id: alertId },
    data: { snoozedUntil: until },
  });
}

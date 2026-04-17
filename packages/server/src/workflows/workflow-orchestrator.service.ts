import { prisma, Prisma } from "@entitlement-os/db";
import { logger } from "../logger";
import { hydrateDealContext, type HydratedDealContext } from "../deals/deal-context-hydrator.service";
import {
  computeDealFitScore,
  type FitScoreResult,
} from "../deals/deal-fit-score.service";
import { loadInvestmentCriteria } from "../services/investment-criteria.service";
import {
  evaluateUnderwritingGate,
  type UnderwritingGateResult,
} from "../deals/underwriting-gate.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowTemplateKey = "QUICK_SCREEN" | "ACQUISITION_PATH";

export type WorkflowExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface WorkflowStepResult {
  key: string;
  label: string;
  status: "ok" | "skipped" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  output: Record<string, unknown>;
  error?: string;
}

export interface WorkflowExecutionRecord {
  id: string;
  orgId: string;
  dealId: string | null;
  templateKey: WorkflowTemplateKey;
  status: WorkflowExecutionStatus;
  currentStepKey: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  stepResults: WorkflowStepResult[];
  error: string | null;
  errorStepKey: string | null;
  startedBy: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface ExecutionContext {
  orgId: string;
  dealId: string;
  userId: string | null;
  bag: Record<string, unknown>;
}

interface StepDefinition {
  key: string;
  label: string;
  description: string;
  run(ctx: ExecutionContext): Promise<Record<string, unknown>>;
}

interface TemplateDefinition {
  key: WorkflowTemplateKey;
  label: string;
  description: string;
  requiresDeal: true;
  steps: StepDefinition[];
  finalize(ctx: ExecutionContext): Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Step library
// ---------------------------------------------------------------------------

const STEP_HYDRATE: StepDefinition = {
  key: "hydrate_context",
  label: "Hydrate deal context",
  description: "Pulls deal summary, triage, financials, stage history.",
  async run(ctx) {
    const context = await hydrateDealContext(ctx.orgId, ctx.dealId);
    if (!context) throw new Error(`Deal ${ctx.dealId} not found`);
    ctx.bag.context = context;
    return {
      dealName: context.name,
      currentStageKey: context.currentStageKey,
      parcelCount: context.parcelCount,
      financialsPresent: context.financial.hasAssumptions,
      latestTriageDecision: context.latestTriage?.decision ?? null,
      latestTriageScore: context.latestTriage?.overallScore ?? null,
    };
  },
};

const STEP_FIT_SCORE: StepDefinition = {
  key: "compute_fit_score",
  label: "Compute investment fit score",
  description: "Scores the deal against org investment criteria.",
  async run(ctx) {
    const criteria = await loadInvestmentCriteria(ctx.orgId);
    const result = await computeDealFitScore(ctx.orgId, ctx.dealId, criteria);
    if (!result) throw new Error("Fit score could not be computed");
    ctx.bag.fitScore = result;
    return {
      score: result.score,
      verdict: result.verdict,
      hardFailureCount: result.hardFailures.length,
      softMissCount: result.softMisses.length,
      hardFailureDimensions: result.hardFailures.map((g) => g.dimension),
    };
  },
};

const STEP_UNDERWRITING_GATE: StepDefinition = {
  key: "evaluate_underwriting_gate",
  label: "Evaluate underwriting gate",
  description: "Checks IRR/LTV/DSCR gates for stage advancement.",
  async run(ctx) {
    const gate = await evaluateUnderwritingGate(ctx.orgId, ctx.dealId);
    if (!gate) throw new Error("Underwriting gate evaluation failed");
    ctx.bag.underwritingGate = gate;
    return {
      pass: gate.pass,
      verdict: gate.verdict,
      reason: gate.reason,
      hardFailureCount: gate.hardFailures.length,
      metrics: gate.metrics,
    };
  },
};

const STEP_SCREEN_SUMMARY: StepDefinition = {
  key: "summarize_screen",
  label: "Summarize screen",
  description: "Rolls context + fit score into a go/no-go summary.",
  async run(ctx) {
    const context = ctx.bag.context as HydratedDealContext | undefined;
    const fit = ctx.bag.fitScore as FitScoreResult | undefined;
    if (!context || !fit) throw new Error("Missing context or fit-score output");

    const recommendation =
      fit.verdict === "fit"
        ? "ADVANCE — passes all gates and preferences"
        : fit.verdict === "borderline"
          ? "REVIEW — passes hard gates with soft misses"
          : fit.verdict === "miss"
            ? `KILL — ${fit.hardFailures.length} hard gate failure(s)`
            : "NEEDS DATA — hydrate financial model before decision";

    return {
      dealName: context.name,
      score: fit.score,
      recommendation,
      topRisks: context.latestTriage?.topRisks ?? [],
      nextActions:
        fit.verdict === "fit"
          ? ["Advance to UNDERWRITING", "Draft investment memo"]
          : fit.verdict === "borderline"
            ? ["Revisit soft-miss dimensions", "Decide with team"]
            : fit.verdict === "miss"
              ? ["Document kill reasons in deal history", "Notify broker"]
              : ["Complete financial model inputs", "Re-run screen"],
    };
  },
};

const STEP_ACQUISITION_DECISION: StepDefinition = {
  key: "acquisition_decision_packet",
  label: "Acquisition decision packet",
  description: "Compiles final go/no-go packet with gate + fit evidence.",
  async run(ctx) {
    const context = ctx.bag.context as HydratedDealContext | undefined;
    const fit = ctx.bag.fitScore as FitScoreResult | undefined;
    const gate = ctx.bag.underwritingGate as UnderwritingGateResult | undefined;
    if (!context || !fit || !gate) throw new Error("Missing upstream step outputs");

    const decision = !gate.pass
      ? "KILL"
      : fit.verdict === "fit"
        ? "ADVANCE"
        : fit.verdict === "borderline"
          ? "REVIEW"
          : "NEEDS_DATA";

    return {
      decision,
      fitScore: fit.score,
      fitVerdict: fit.verdict,
      gatePass: gate.pass,
      gateReason: gate.reason,
      metrics: gate.metrics,
      hardFailures: gate.hardFailures,
      currentStageKey: context.currentStageKey,
      pendingApprovals: context.openApprovalCount,
    };
  },
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const WORKFLOW_TEMPLATES: Record<WorkflowTemplateKey, TemplateDefinition> = {
  QUICK_SCREEN: {
    key: "QUICK_SCREEN",
    label: "Quick screen",
    description: "Hydrate → fit score → go/no-go summary. Meant for 30-second origination triage.",
    requiresDeal: true,
    steps: [STEP_HYDRATE, STEP_FIT_SCORE, STEP_SCREEN_SUMMARY],
    finalize(ctx) {
      const fit = ctx.bag.fitScore as FitScoreResult | undefined;
      return {
        verdict: fit?.verdict ?? "unknown",
        score: fit?.score ?? null,
      };
    },
  },
  ACQUISITION_PATH: {
    key: "ACQUISITION_PATH",
    label: "Acquisition path",
    description:
      "Hydrate → fit score → underwriting gate → decision packet. Ends with ADVANCE / REVIEW / KILL / NEEDS_DATA.",
    requiresDeal: true,
    steps: [STEP_HYDRATE, STEP_FIT_SCORE, STEP_UNDERWRITING_GATE, STEP_ACQUISITION_DECISION],
    finalize(ctx) {
      const gate = ctx.bag.underwritingGate as UnderwritingGateResult | undefined;
      const fit = ctx.bag.fitScore as FitScoreResult | undefined;
      const decision = !gate?.pass
        ? "KILL"
        : fit?.verdict === "fit"
          ? "ADVANCE"
          : fit?.verdict === "borderline"
            ? "REVIEW"
            : fit?.verdict === "insufficient_data"
              ? "NEEDS_DATA"
              : "KILL";
      return {
        decision,
        fitScore: fit?.score ?? null,
        fitVerdict: fit?.verdict ?? null,
        gatePass: gate?.pass ?? null,
      };
    },
  },
};

export function listTemplates(): Array<{
  key: WorkflowTemplateKey;
  label: string;
  description: string;
  stepLabels: string[];
}> {
  return Object.values(WORKFLOW_TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    stepLabels: t.steps.map((s) => s.label),
  }));
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function normalize(row: {
  id: string;
  orgId: string;
  dealId: string | null;
  templateKey: string;
  status: string;
  currentStepKey: string | null;
  stepsTotal: number;
  stepsCompleted: number;
  input: unknown;
  output: unknown;
  stepResults: unknown;
  error: string | null;
  errorStepKey: string | null;
  startedBy: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}): WorkflowExecutionRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    dealId: row.dealId,
    templateKey: row.templateKey as WorkflowTemplateKey,
    status: row.status as WorkflowExecutionStatus,
    currentStepKey: row.currentStepKey,
    stepsTotal: row.stepsTotal,
    stepsCompleted: row.stepsCompleted,
    input: (row.input ?? {}) as Record<string, unknown>,
    output: (row.output ?? {}) as Record<string, unknown>,
    stepResults: Array.isArray(row.stepResults)
      ? (row.stepResults as WorkflowStepResult[])
      : [],
    error: row.error,
    errorStepKey: row.errorStepKey,
    startedBy: row.startedBy,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  };
}

export interface StartWorkflowInput {
  orgId: string;
  dealId: string;
  templateKey: WorkflowTemplateKey;
  startedBy: string | null;
  inputData?: Record<string, unknown>;
}

/**
 * Creates a pending execution row. Does not run. Caller should await
 * `runWorkflowExecution` (or use `runWorkflowSync` helper) to execute.
 */
export async function createWorkflowExecution(
  input: StartWorkflowInput,
): Promise<WorkflowExecutionRecord> {
  const template = WORKFLOW_TEMPLATES[input.templateKey];
  if (!template) throw new Error(`Unknown workflow template: ${input.templateKey}`);

  const created = await prisma.workflowExecution.create({
    data: {
      orgId: input.orgId,
      dealId: input.dealId,
      templateKey: input.templateKey,
      status: "pending",
      stepsTotal: template.steps.length,
      stepsCompleted: 0,
      input: (input.inputData ?? {}) as Prisma.InputJsonValue,
      output: {} as Prisma.InputJsonValue,
      stepResults: [] as Prisma.InputJsonValue,
      startedBy: input.startedBy,
    },
  });

  return normalize(created);
}

/**
 * Executes an already-created workflow execution. Persists per-step progress
 * so a poller sees incremental updates.
 */
export async function runWorkflowExecution(
  executionId: string,
): Promise<WorkflowExecutionRecord> {
  const existing = await prisma.workflowExecution.findUnique({
    where: { id: executionId },
  });
  if (!existing) throw new Error(`Workflow execution ${executionId} not found`);
  if (existing.status !== "pending") {
    return normalize(existing);
  }

  const template = WORKFLOW_TEMPLATES[existing.templateKey as WorkflowTemplateKey];
  if (!template) {
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: {
        status: "failed",
        error: `Unknown template: ${existing.templateKey}`,
        completedAt: new Date(),
      },
    });
    throw new Error(`Unknown template: ${existing.templateKey}`);
  }
  if (!existing.dealId) {
    throw new Error("Workflow execution requires a dealId");
  }

  const startedAtMs = Date.now();
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { status: "running" },
  });

  const ctx: ExecutionContext = {
    orgId: existing.orgId,
    dealId: existing.dealId,
    userId: existing.startedBy ?? null,
    bag: {},
  };

  const results: WorkflowStepResult[] = [];
  let completedCount = 0;

  for (const step of template.steps) {
    const stepStart = new Date();
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { currentStepKey: step.key },
    });

    try {
      const output = await step.run(ctx);
      const stepEnd = new Date();
      const result: WorkflowStepResult = {
        key: step.key,
        label: step.label,
        status: "ok",
        startedAt: stepStart.toISOString(),
        completedAt: stepEnd.toISOString(),
        durationMs: stepEnd.getTime() - stepStart.getTime(),
        output,
      };
      results.push(result);
      completedCount += 1;
      await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          stepsCompleted: completedCount,
          stepResults: results as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const stepEnd = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const failedResult: WorkflowStepResult = {
        key: step.key,
        label: step.label,
        status: "failed",
        startedAt: stepStart.toISOString(),
        completedAt: stepEnd.toISOString(),
        durationMs: stepEnd.getTime() - stepStart.getTime(),
        output: {},
        error: message,
      };
      results.push(failedResult);
      logger.warn("Workflow step failed", {
        executionId,
        templateKey: template.key,
        stepKey: step.key,
        error: message,
      });
      const updated = await prisma.workflowExecution.update({
        where: { id: executionId },
        data: {
          status: "failed",
          currentStepKey: null,
          error: message,
          errorStepKey: step.key,
          stepsCompleted: completedCount,
          stepResults: results as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
          durationMs: Date.now() - startedAtMs,
        },
      });
      return normalize(updated);
    }
  }

  const finalOutput = template.finalize(ctx);
  const updated = await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: "completed",
      currentStepKey: null,
      stepsCompleted: completedCount,
      stepResults: results as unknown as Prisma.InputJsonValue,
      output: finalOutput as Prisma.InputJsonValue,
      completedAt: new Date(),
      durationMs: Date.now() - startedAtMs,
    },
  });

  return normalize(updated);
}

/**
 * Convenience: create + run in one call. Used by the agent tool and API
 * when the caller wants the full execution record back synchronously.
 */
export async function runWorkflowSync(
  input: StartWorkflowInput,
): Promise<WorkflowExecutionRecord> {
  const created = await createWorkflowExecution(input);
  return runWorkflowExecution(created.id);
}

export async function getWorkflowExecution(
  orgId: string,
  executionId: string,
): Promise<WorkflowExecutionRecord | null> {
  const row = await prisma.workflowExecution.findFirst({
    where: { id: executionId, orgId },
  });
  return row ? normalize(row) : null;
}

export async function listDealWorkflowExecutions(
  orgId: string,
  dealId: string,
  limit = 25,
): Promise<WorkflowExecutionRecord[]> {
  const rows = await prisma.workflowExecution.findMany({
    where: { orgId, dealId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map(normalize);
}

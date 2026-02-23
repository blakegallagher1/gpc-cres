import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@entitlement-os/db";

import { isAgentOsFeatureEnabled } from "../config.js";
import type { TokenUsage, ToolCallEntry } from "../schemas.js";
import type { PolicyAuditEntry } from "../tools/policyEngine.js";
import { computeRunCost } from "./costTracker.js";

type JsonRecord = Record<string, unknown>;

/**
 * Input data collected from the agent run, assembled by the caller
 * from various sources (run result, trace spans, policy audit, etc.).
 */
export type RunData = {
  runId: string;
  orgId: string;
  agentId: string;
  taskInput: string;
  finalOutput: string;
  status: "succeeded" | "failed" | "canceled";
  latencyMs: number;
  model: string;

  tokenUsage: TokenUsage;
  toolCalls: ToolCallEntry[];
  intermediateSteps: JsonRecord;
  retrievedContextSummary: JsonRecord;
  plan: string | null;
  policyAuditEntries: PolicyAuditEntry[];
};

export type TrajectoryRecord = {
  id: string;
  runId: string;
  orgId: string;
  agentId: string;
  taskInput: string;
  finalOutput: string;
  latencyMs: number;
  costUsd: number;
  tokenUsage: TokenUsage;
  toolCalls: ToolCallEntry[];
  riskEvents: JsonRecord[];
  plan: string | null;
};

function policyAuditToRiskEvents(entries: PolicyAuditEntry[]): JsonRecord[] {
  return entries
    .filter((e) => e.decision.action !== "approve")
    .map((e) => ({
      type: e.decision.rule ?? "policy_violation",
      detail: e.decision.reason,
      severity: e.decision.action === "deny" ? "high" : "medium",
      timestamp: e.ts,
      toolName: e.toolName,
    }));
}

export class TrajectoryLogger {
  constructor(private readonly prisma: PrismaClient) {}

  async capture(runData: RunData): Promise<TrajectoryRecord | null> {
    if (!isAgentOsFeatureEnabled("trajectoryCapture")) return null;

    const id = randomUUID();
    const costUsd = computeRunCost(runData.tokenUsage, runData.model);
    const riskEvents = policyAuditToRiskEvents(runData.policyAuditEntries);

    await this.prisma.trajectoryLog.create({
      data: {
        id,
        orgId: runData.orgId,
        runId: runData.runId,
        agentId: runData.agentId,
        taskInput: runData.taskInput,
        retrievedContextSummary: runData.retrievedContextSummary as Prisma.InputJsonValue,
        plan: runData.plan,
        toolCalls: runData.toolCalls as unknown as Prisma.InputJsonValue,
        intermediateSteps: runData.intermediateSteps as Prisma.InputJsonValue,
        finalOutput: runData.finalOutput,
        latencyMs: runData.latencyMs,
        tokenUsage: runData.tokenUsage as unknown as Prisma.InputJsonValue,
        costUsd,
        riskEvents: riskEvents as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.run.update({
      where: { id: runData.runId },
      data: {
        trajectory: {
          trajectoryId: id,
          costUsd,
          toolCount: runData.toolCalls.length,
          riskEventCount: riskEvents.length,
          tokenUsage: runData.tokenUsage,
        } as Prisma.InputJsonValue,
      },
    }).catch(() => {});

    return {
      id,
      runId: runData.runId,
      orgId: runData.orgId,
      agentId: runData.agentId,
      taskInput: runData.taskInput,
      finalOutput: runData.finalOutput,
      latencyMs: runData.latencyMs,
      costUsd,
      tokenUsage: runData.tokenUsage,
      toolCalls: runData.toolCalls,
      riskEvents,
      plan: runData.plan,
    };
  }
}

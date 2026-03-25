import { prisma, type Prisma } from "@entitlement-os/db";
import { SKU_TYPES } from "@entitlement-os/shared";
import { deserializeRunStateEnvelope } from "@entitlement-os/openai";
import type { AgentReport } from "@entitlement-os/shared";
import type { AgentTrustEnvelope } from "@/types";

/**
 * Normalized agent run payload returned by local execution and replay paths.
 */
export type AgentExecutionResult = {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
  finalOutput: string;
  finalReport: AgentReport | null;
  toolsInvoked: string[];
  trust: AgentTrustEnvelope;
  openaiResponseId: string | null;
  inputHash: string;
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Reads the serialized run-state string from either the current envelope shape
 * or the legacy inline field used by older persisted runs.
 */
export function readSerializedRunStateFromStoredValue(value: unknown): string | null {
  const envelope = deserializeRunStateEnvelope(value);
  if (envelope) {
    return envelope.serializedRunState;
  }

  if (isRecord(value) && typeof value.serializedRunState === "string") {
    return value.serializedRunState;
  }

  return null;
}

/**
 * Persists the final run payload, optionally honoring an execution lease token
 * to avoid duplicate writers.
 */
export async function persistFinalRunResult(params: {
  runId: string;
  status: AgentExecutionResult["status"];
  openaiResponseId: string | null;
  outputJson: Prisma.InputJsonValue;
  trajectory?: Prisma.InputJsonValue;
  serializedState?: Prisma.InputJsonValue | null;
  executionLeaseToken?: string;
}): Promise<boolean> {
  if (!params.executionLeaseToken) {
    await prisma.run.update({
      where: { id: params.runId },
      data: {
        status: params.status,
        finishedAt: new Date(),
        openaiResponseId: params.openaiResponseId,
        outputJson: params.outputJson,
        trajectory: params.trajectory ?? undefined,
        serializedState: params.serializedState ?? undefined,
      },
    });
    return true;
  }

  const updated = await prisma.run.updateMany({
    where: { id: params.runId, openaiResponseId: params.executionLeaseToken },
    data: {
      status: params.status,
      finishedAt: new Date(),
      openaiResponseId: params.openaiResponseId,
      outputJson: params.outputJson,
      trajectory: params.trajectory ?? undefined,
      serializedState: params.serializedState ?? undefined,
    },
  });

  return updated.count === 1;
}

/**
 * Creates or resumes a run row with normalized run metadata.
 */
export async function upsertRunRecord(params: {
  runId: string;
  orgId: string;
  runType: string;
  inputHash: string;
  dealId?: string | null;
  jurisdictionId?: string | null;
  sku?: string | null;
  status?: "running" | "succeeded" | "failed" | "canceled";
}) {
  const runType = (params.runType ?? "ENRICHMENT") as
    | "TRIAGE"
    | "PARISH_PACK_REFRESH"
    | "ARTIFACT_GEN"
    | "BUYER_LIST_BUILD"
    | "CHANGE_DETECT"
    | "ENRICHMENT"
    | "INTAKE_PARSE"
    | "DOCUMENT_CLASSIFY"
    | "BUYER_OUTREACH_DRAFT"
    | "ADVANCEMENT_CHECK"
    | "OPPORTUNITY_SCAN"
    | "DEADLINE_MONITOR";

  return prisma.run.upsert({
    where: { id: params.runId },
    create: {
      id: params.runId,
      orgId: params.orgId,
      runType,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: normalizeSku(params.sku),
      status: params.status ?? "running",
      inputHash: params.inputHash,
    },
    update: {
      orgId: params.orgId,
      runType,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: normalizeSku(params.sku),
      status: params.status ?? "running",
      inputHash: params.inputHash,
      ...(params.status === "running" ? { startedAt: new Date() } : {}),
    },
  });
}

function normalizeSku(sku: string | null | undefined): (typeof SKU_TYPES)[number] | null {
  if (!sku) {
    return null;
  }
  if ((SKU_TYPES as readonly string[]).includes(sku)) {
    return sku as (typeof SKU_TYPES)[number];
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

import { deserializeRunStateEnvelope } from "@entitlement-os/openai";
import { prisma, type Prisma } from "@entitlement-os/db";
import { SKU_TYPES } from "@entitlement-os/shared";

// NOTE: This file mirrors the implementation in
// `packages/db/src/repositories/run.repository.ts` (and the re-export in
// `packages/server/src/chat/run-state.ts`). The duplicate exists so that
// vitest's `vi.mock("@entitlement-os/db", ...)` partial mocks intercept the
// prisma client at the call site — relative imports inside packages/db
// bypass the mock, while this file's bare-specifier import does not.

export type { AgentExecutionResult } from "@gpc/server/chat/run-state";

export function readSerializedRunStateFromStoredValue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const fromEnvelope = deserializeRunStateEnvelope(value);
  if (fromEnvelope?.serializedRunState) {
    return fromEnvelope.serializedRunState;
  }

  const legacyValue = (value as { serializedRunState?: unknown }).serializedRunState;
  return typeof legacyValue === "string" ? legacyValue : null;
}

export function normalizeSku(sku: string | null | undefined): (typeof SKU_TYPES)[number] | null {
  if (!sku) {
    return null;
  }
  if ((SKU_TYPES as readonly string[]).includes(sku)) {
    return sku as (typeof SKU_TYPES)[number];
  }
  return null;
}

export async function persistFinalRunResult(params: {
  runId: string;
  status: "running" | "succeeded" | "failed" | "canceled";
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
      startedAt: new Date(),
    },
    update: {
      orgId: params.orgId,
      runType,
      dealId: params.dealId ?? null,
      jurisdictionId: params.jurisdictionId ?? null,
      sku: normalizeSku(params.sku),
      status: params.status ?? "running",
      inputHash: params.inputHash,
    },
  });
}

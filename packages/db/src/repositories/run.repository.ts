import { prisma, type Prisma } from "../index.js";
import { SKU_TYPES } from "@entitlement-os/shared";

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

export function normalizeSku(sku: string | null | undefined): (typeof SKU_TYPES)[number] | null {
  if (!sku) {
    return null;
  }
  if ((SKU_TYPES as readonly string[]).includes(sku)) {
    return sku as (typeof SKU_TYPES)[number];
  }
  return null;
}

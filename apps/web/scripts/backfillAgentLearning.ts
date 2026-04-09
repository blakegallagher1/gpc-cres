import { prisma, type Prisma } from "@entitlement-os/db";

import { dispatchEvent } from "../lib/automation/events";
import { logger } from "../lib/logger";

const BATCH_SIZE = 100;

type BackfillRunRecord = {
  id: string;
  orgId: string;
  dealId: string | null;
  jurisdictionId: string | null;
  finishedAt: Date;
  runType: string;
  status: string;
  outputJson: Prisma.JsonValue | null;
};

type ConversationContext = {
  conversationId: string;
  userId: string;
  inputPreview: string | null;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: Prisma.JsonValue | null | undefined): JsonRecord {
  return isRecord(value) ? value : {};
}

function truncateText(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, limit);
}

function mapRunStatus(
  status: string,
): "succeeded" | "failed" | "canceled" | null {
  if (status === "succeeded") return "succeeded";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  return null;
}

function extractQueryIntent(outputJson: JsonRecord): string | null {
  if (typeof outputJson.queryIntent === "string") {
    return outputJson.queryIntent;
  }

  const runState = isRecord(outputJson.runState) ? outputJson.runState : null;
  if (runState && typeof runState.queryIntent === "string") {
    return runState.queryIntent;
  }

  const pendingApproval = isRecord(outputJson.pendingApproval)
    ? outputJson.pendingApproval
    : null;
  if (pendingApproval && typeof pendingApproval.queryIntent === "string") {
    return pendingApproval.queryIntent;
  }

  return null;
}

function extractInputPreviewFromOutput(outputJson: JsonRecord): string | null {
  if (typeof outputJson.inputPreview === "string") {
    return truncateText(outputJson.inputPreview, 2000);
  }

  const finalReport = isRecord(outputJson.finalReport) ? outputJson.finalReport : null;
  const taskUnderstanding =
    finalReport && isRecord(finalReport.task_understanding)
      ? finalReport.task_understanding
      : null;

  if (taskUnderstanding && typeof taskUnderstanding.summary === "string") {
    return truncateText(taskUnderstanding.summary, 2000);
  }

  return null;
}

async function findConversationContext(
  orgId: string,
  dealId: string | null,
): Promise<ConversationContext | null> {
  const query = async (includeDealFilter: boolean) =>
    prisma.conversation.findFirst({
      where: {
        orgId,
        ...(includeDealFilter && dealId ? { dealId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        messages: {
          where: { role: "user" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    });

  const conversation =
    (dealId ? await query(true) : null) ??
    (await query(false));

  if (!conversation) {
    return null;
  }

  return {
    conversationId: conversation.id,
    userId: conversation.userId,
    inputPreview: truncateText(conversation.messages[0]?.content ?? null, 2000),
  };
}

async function dispatchBackfillEvent(run: BackfillRunRecord): Promise<void> {
  const mappedStatus = mapRunStatus(run.status);
  if (!mappedStatus) {
    throw new Error(`Unsupported run status: ${run.status}`);
  }

  const outputJson = toJsonRecord(run.outputJson);
  const conversationContext = await findConversationContext(run.orgId, run.dealId);

  if (!conversationContext) {
    throw new Error("missing conversation/user context");
  }

  dispatchEvent({
    type: "agent.run.completed",
    runId: run.id,
    orgId: run.orgId,
    userId: conversationContext.userId,
    conversationId: conversationContext.conversationId,
    dealId: run.dealId,
    jurisdictionId: run.jurisdictionId,
    runType: run.runType,
    status: mappedStatus,
    inputPreview:
      conversationContext.inputPreview ?? extractInputPreviewFromOutput(outputJson),
    queryIntent: extractQueryIntent(outputJson),
  }).catch((error) => {
    logger.warn("Backfill agent learning event dispatch failed", {
      eventType: "agent.run.completed",
      runId: run.id,
      orgId: run.orgId,
      userId: conversationContext.userId,
      status: mappedStatus,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function main(): Promise<void> {
  let totalProcessed = 0;
  let totalDispatched = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let cursor: Pick<BackfillRunRecord, "finishedAt" | "id"> | null = null;

  while (true) {
    const paginationWhere = cursor
      ? {
          OR: [
            { finishedAt: { gt: cursor.finishedAt } },
            {
              AND: [
                { finishedAt: cursor.finishedAt },
                { id: { gt: cursor.id } },
              ],
            },
          ],
        }
      : {};

    const runs = await prisma.run.findMany({
      where: {
        finishedAt: { not: null },
        status: { in: ["succeeded", "failed", "canceled"] },
        memoryPromotionStatus: null,
        ...paginationWhere,
      },
      orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
      take: BATCH_SIZE,
      select: {
        id: true,
        orgId: true,
        dealId: true,
        jurisdictionId: true,
        finishedAt: true,
        runType: true,
        status: true,
        outputJson: true,
      },
    });

    if (runs.length === 0) {
      break;
    }

    const lastRun = runs[runs.length - 1];
    cursor = { finishedAt: lastRun.finishedAt, id: lastRun.id };

    for (const run of runs) {
      totalProcessed += 1;

      try {
        await dispatchBackfillEvent(run);
        totalDispatched += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "missing conversation/user context") {
          totalSkipped += 1;
          console.warn(`[agent-learning-backfill] skipped run=${run.id} reason=${message}`);
          continue;
        }

        totalFailed += 1;
        console.error(
          `[agent-learning-backfill] failed run=${run.id} error=${message}`,
        );
      }
    }

    console.log(
      `[agent-learning-backfill] batch processed=${totalProcessed} dispatched=${totalDispatched} skipped=${totalSkipped} failed=${totalFailed}`,
    );
  }

  console.log(
    `[agent-learning-backfill] complete processed=${totalProcessed} dispatched=${totalDispatched} skipped=${totalSkipped} failed=${totalFailed}`,
  );
}

main().catch((error) => {
  console.error(
    `[agent-learning-backfill] fatal error=${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

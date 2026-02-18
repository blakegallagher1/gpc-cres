import { prisma, type Prisma } from "@entitlement-os/db";
import { getNotificationService } from "@/lib/services/notification.service";

export type ProactiveUserResponse = "APPROVE" | "REJECT" | "MODIFY";
type ProactiveActionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "MODIFY_REQUESTED"
  | "AUTO_EXECUTED"
  | "EXPIRED"
  | "FAILED";
type ProactiveActionType = "NOTIFY" | "RUN_WORKFLOW" | "CREATE_TASK" | "AUTO_TRIAGE";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function notificationPriorityForAction(priority: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (priority === "URGENT") return "CRITICAL";
  if (priority === "HIGH") return "HIGH";
  if (priority === "LOW") return "LOW";
  return "MEDIUM";
}

export async function listProactiveActions(params: {
  orgId: string;
  userId: string;
  status?: string;
}) {
  return prisma.proactiveAction.findMany({
    where: {
      orgId: params.orgId,
      userId: params.userId,
      ...(params.status ? { status: params.status as ProactiveActionStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function notifyPendingProactiveAction(actionId: string): Promise<void> {
  const action = await prisma.proactiveAction.findUnique({
    where: { id: actionId },
  });
  if (!action) return;

  const notifier = getNotificationService();
  await notifier.create({
    orgId: action.orgId,
    userId: action.userId,
    type: "AUTOMATION",
    title: `Approval requested: ${action.title}`,
    body: action.description,
    priority: notificationPriorityForAction(action.priority),
    actionUrl: "/automation?tab=proactive",
    sourceAgent: "proactive-engine",
    metadata: {
      proactiveActionId: action.id,
      triggerId: action.triggerId,
      status: action.status,
    },
  });
}

async function executeAction(action: {
  id: string;
  orgId: string;
  userId: string;
  actionType: ProactiveActionType;
  title: string;
  description: string;
  context: Prisma.JsonValue;
}): Promise<{ actionTaken: string; result: Record<string, unknown>; cost: number }> {
  const notifier = getNotificationService();
  const context = asRecord(action.context);
  const dealId = typeof context.dealId === "string" ? context.dealId : null;
  const estimatedCost =
    typeof context.estimatedCost === "number" && Number.isFinite(context.estimatedCost)
      ? context.estimatedCost
      : 0;

  if (action.actionType === "NOTIFY") {
    await notifier.create({
      orgId: action.orgId,
      userId: action.userId,
      type: "AUTOMATION",
      title: action.title,
      body: action.description,
      priority: "MEDIUM",
      actionUrl: "/automation?tab=proactive",
      sourceAgent: "proactive-engine",
      metadata: { proactiveActionId: action.id },
    });

    return {
      actionTaken: "NOTIFY",
      result: { delivered: true },
      cost: estimatedCost,
    };
  }

  if (action.actionType === "CREATE_TASK") {
    if (!dealId) {
      return {
        actionTaken: "CREATE_TASK_SKIPPED",
        result: { skipped: true, reason: "Missing dealId in action context." },
        cost: estimatedCost,
      };
    }

    const task = await prisma.task.create({
      data: {
        orgId: action.orgId,
        dealId,
        title: action.title,
        description: action.description,
        status: "TODO",
        pipelineStep: 2,
        ownerUserId: action.userId,
      },
      select: { id: true, dealId: true },
    });

    return {
      actionTaken: "CREATE_TASK",
      result: { taskId: task.id, dealId: task.dealId },
      cost: estimatedCost,
    };
  }

  if (action.actionType === "RUN_WORKFLOW") {
    return {
      actionTaken: "RUN_WORKFLOW_DEFERRED",
      result: {
        queued: true,
        message:
          "RUN_WORKFLOW is marked approved and queued for workflow execution integration.",
      },
      cost: estimatedCost,
    };
  }

  return {
    actionTaken: "AUTO_TRIAGE_DEFERRED",
    result: {
      queued: true,
      message:
        "AUTO_TRIAGE is marked approved and queued for triage integration.",
    },
    cost: estimatedCost,
  };
}

export async function executeProactiveAction(params: {
  actionId: string;
  mode: "auto" | "approved";
}): Promise<void> {
  const action = await prisma.proactiveAction.findUnique({
    where: { id: params.actionId },
  });
  if (!action) return;

  const execution = await executeAction({
    id: action.id,
    orgId: action.orgId,
    userId: action.userId,
    actionType: action.actionType,
    title: action.title,
    description: action.description,
    context: action.context,
  });

  const nextStatus = params.mode === "auto" ? "AUTO_EXECUTED" : "APPROVED";
  await prisma.proactiveAction.update({
    where: { id: action.id },
    data: {
      status: nextStatus,
      actionTaken: execution.actionTaken,
      actionResult: toJson(execution.result),
      cost: execution.cost,
      respondedAt: new Date(),
    },
  });

  const notifier = getNotificationService();
  await notifier.create({
    orgId: action.orgId,
    userId: action.userId,
    type: "AUTOMATION",
    title: params.mode === "auto" ? `Auto-executed: ${action.title}` : `Approved: ${action.title}`,
    body: action.description,
    priority: notificationPriorityForAction(action.priority),
    actionUrl: "/automation?tab=proactive",
    sourceAgent: "proactive-engine",
    metadata: {
      proactiveActionId: action.id,
      status: nextStatus,
      actionTaken: execution.actionTaken,
    },
  });
}

export async function respondToProactiveAction(params: {
  orgId: string;
  userId: string;
  actionId: string;
  response: ProactiveUserResponse;
  note?: string;
}) {
  const action = await prisma.proactiveAction.findFirst({
    where: {
      id: params.actionId,
      orgId: params.orgId,
      userId: params.userId,
      status: "PENDING",
    },
  });
  if (!action) {
    throw new Error("Action not found");
  }

  if (params.response === "APPROVE") {
    await executeProactiveAction({ actionId: action.id, mode: "approved" });
    return { status: "APPROVED" as const };
  }

  const nextStatus =
    params.response === "REJECT" ? "REJECTED" : "MODIFY_REQUESTED";
  await prisma.proactiveAction.update({
    where: { id: action.id },
    data: {
      status: nextStatus,
      userResponse: params.response,
      userNote: params.note ?? null,
      respondedAt: new Date(),
    },
  });

  return { status: nextStatus };
}

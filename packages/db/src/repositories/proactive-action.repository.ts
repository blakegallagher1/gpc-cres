import { prisma, type Prisma } from "../index.js";

export type ProactiveUserResponse = "APPROVE" | "REJECT" | "MODIFY";
export type ProactiveActionStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "MODIFY_REQUESTED"
  | "AUTO_EXECUTED"
  | "EXPIRED"
  | "FAILED";

export type ProactiveActionType = "NOTIFY" | "RUN_WORKFLOW" | "CREATE_TASK" | "AUTO_TRIAGE";

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

export async function getProactiveActionById(actionId: string) {
  return prisma.proactiveAction.findUnique({
    where: { id: actionId },
  });
}

export async function findPendingProactiveAction(params: {
  actionId: string;
  orgId: string;
  userId: string;
}) {
  return prisma.proactiveAction.findFirst({
    where: {
      id: params.actionId,
      orgId: params.orgId,
      userId: params.userId,
      status: "PENDING",
    },
  });
}

export async function updateProactiveAction(
  actionId: string,
  data: Prisma.ProactiveActionUpdateInput,
) {
  return prisma.proactiveAction.update({
    where: { id: actionId },
    data,
  });
}

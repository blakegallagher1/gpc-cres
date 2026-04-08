import { prisma } from "@entitlement-os/db";

export type Urgency = "green" | "yellow" | "red" | "black";

export type DeadlineItem = {
  taskId: string;
  taskTitle: string;
  dueAt: string;
  hoursUntilDue: number;
  urgency: Urgency;
  status: string;
  pipelineStep: number;
  dealId: string;
  dealName: string;
  dealStatus: string;
};

type PrismaKnownRequestLikeError = {
  code?: unknown;
  meta?: unknown;
};

function classifyUrgency(hoursUntilDue: number): Urgency {
  if (hoursUntilDue <= 0) return "black";
  if (hoursUntilDue <= 24) return "red";
  if (hoursUntilDue <= 72) return "yellow";
  return "green";
}

function mapTaskDeadline(task: {
  id: string;
  title: string;
  dueAt: Date;
  status: string;
  pipelineStep: number;
  deal: {
    id: string;
    name: string;
    status: string;
  };
}): DeadlineItem {
  const hoursUntilDue = (task.dueAt.getTime() - Date.now()) / 3600000;

  return {
    taskId: task.id,
    taskTitle: task.title,
    dueAt: task.dueAt.toISOString(),
    hoursUntilDue: Math.round(hoursUntilDue),
    urgency: classifyUrgency(hoursUntilDue),
    status: task.status,
    pipelineStep: task.pipelineStep,
    dealId: task.deal.id,
    dealName: task.deal.name,
    dealStatus: task.deal.status,
  };
}

function mapEntitlementDeadline(entry: {
  id: string;
  hearingScheduledDate: Date;
  hearingBody: string | null;
  deal: {
    id: string;
    name: string;
    status: string;
  };
}): DeadlineItem {
  const hoursUntilDue = (entry.hearingScheduledDate.getTime() - Date.now()) / 3600000;

  return {
    taskId: `entitlement-${entry.id}`,
    taskTitle: `Entitlement hearing (${entry.hearingBody ?? "Scheduled"})`,
    dueAt: entry.hearingScheduledDate.toISOString(),
    hoursUntilDue: Math.round(hoursUntilDue),
    urgency: classifyUrgency(hoursUntilDue),
    status: "SCHEDULED",
    pipelineStep: 0,
    dealId: entry.deal.id,
    dealName: entry.deal.name,
    dealStatus: entry.deal.status,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingEntitlementPathsTableError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const known = error as PrismaKnownRequestLikeError;
  if (known.code !== "P2021") {
    return false;
  }

  if (!isRecord(known.meta)) {
    return false;
  }

  const table = known.meta.table;
  return typeof table === "string" && table.includes("entitlement_paths");
}

export async function getIntelligenceDeadlinesForOrg(orgId: string): Promise<{
  deadlines: DeadlineItem[];
  total: number;
}> {
  const tasksPromise = prisma.task.findMany({
    where: {
      dueAt: { not: null },
      status: { notIn: ["DONE", "CANCELED"] },
      deal: { orgId },
    },
    select: {
      id: true,
      title: true,
      dueAt: true,
      status: true,
      pipelineStep: true,
      deal: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
    orderBy: { dueAt: "asc" },
    take: 50,
  });

  const entitlementPathsPromise = prisma.entitlementPath
    .findMany({
      where: {
        hearingScheduledDate: { not: null },
        deal: { orgId },
      },
      select: {
        id: true,
        hearingScheduledDate: true,
        hearingBody: true,
        deal: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { hearingScheduledDate: "asc" },
      take: 50,
    })
    .catch((error: unknown) => {
      if (isMissingEntitlementPathsTableError(error)) {
        return [];
      }
      throw error;
    });

  const [tasks, entitlementPaths] = await Promise.all([
    tasksPromise,
    entitlementPathsPromise,
  ]);

  const deadlines = [
    ...tasks
      .filter(
        (task): task is typeof task & {
          dueAt: Date;
        } => Boolean(task.dueAt),
      )
      .map((task) =>
        mapTaskDeadline({
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
          status: task.status,
          pipelineStep: task.pipelineStep,
          deal: task.deal,
        }),
      ),
    ...entitlementPaths.flatMap((entry) => {
      if (!entry.hearingScheduledDate) {
        return [];
      }

      return [
        mapEntitlementDeadline({
          id: entry.id,
          hearingScheduledDate: entry.hearingScheduledDate,
          hearingBody: entry.hearingBody,
          deal: entry.deal,
        }),
      ];
    }),
  ];

  const urgencyOrder: Record<Urgency, number> = {
    black: 0,
    red: 1,
    yellow: 2,
    green: 3,
  };

  deadlines.sort(
    (left, right) => urgencyOrder[left.urgency] - urgencyOrder[right.urgency],
  );

  return {
    deadlines,
    total: deadlines.length,
  };
}

import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

type Urgency = "green" | "yellow" | "red" | "black";

type DeadlineItem = {
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
  const dueAt = task.dueAt;
  const hoursUntilDue = (dueAt.getTime() - Date.now()) / 3600000;

  return {
    taskId: task.id,
    taskTitle: task.title,
    dueAt: dueAt.toISOString(),
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
  const dueAt = entry.hearingScheduledDate;
  const hoursUntilDue = (dueAt.getTime() - Date.now()) / 3600000;

  return {
    taskId: `entitlement-${entry.id}`,
    taskTitle: `Entitlement hearing (${entry.hearingBody ?? "Scheduled"})`,
    dueAt: dueAt.toISOString(),
    hoursUntilDue: Math.round(hoursUntilDue),
    urgency: classifyUrgency(hoursUntilDue),
    status: "SCHEDULED",
    pipelineStep: 0,
    dealId: entry.deal.id,
    dealName: entry.deal.name,
    dealStatus: entry.deal.status,
  };
}

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tasks, entitlementPaths] = await Promise.all([
    prisma.task.findMany({
      where: {
        dueAt: { not: null },
        status: { notIn: ["DONE", "CANCELED"] },
        deal: { orgId: auth.orgId },
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        status: true,
        pipelineStep: true,
        ownerUserId: true,
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
    }),
    prisma.entitlementPath.findMany({
      where: {
        hearingScheduledDate: { not: null },
        deal: { orgId: auth.orgId },
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
    }),
  ]);

  const taskDeadlines = tasks
    .filter((task) => task.dueAt)
    .map((task) =>
      mapTaskDeadline(task as {
        id: string;
        title: string;
        dueAt: Date;
        status: string;
        pipelineStep: number;
        deal: { id: string; name: string; status: string };
      }),
    );

  const entitlementDeadlines = entitlementPaths
    .map((entry) =>
      mapEntitlementDeadline(entry as {
        id: string;
        hearingScheduledDate: Date;
        hearingBody: string | null;
        deal: { id: string; name: string; status: string };
      }),
    );

  const deadlines = [...taskDeadlines, ...entitlementDeadlines];

  // Sort by urgency: black first, then red, yellow, green
  const urgencyOrder: Record<string, number> = {
    black: 0,
    red: 1,
    yellow: 2,
    green: 3,
  };
  deadlines.sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4),
  );

  return NextResponse.json({ deadlines, total: deadlines.length });
}

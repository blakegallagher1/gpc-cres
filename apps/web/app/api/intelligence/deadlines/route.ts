import { NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function GET() {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all tasks with deadlines that are not completed/canceled, scoped to org
  const tasks = await prisma.task.findMany({
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
  });

  const now = new Date();

  const deadlines = tasks.map((task) => {
    const dueAt = task.dueAt!;
    const hoursUntilDue = (dueAt.getTime() - now.getTime()) / 3600000;

    let urgency: "green" | "yellow" | "red" | "black";
    if (hoursUntilDue <= 0) urgency = "black";
    else if (hoursUntilDue <= 24) urgency = "red";
    else if (hoursUntilDue <= 72) urgency = "yellow";
    else urgency = "green";

    return {
      taskId: task.id,
      taskTitle: task.title,
      dueAt: dueAt.toISOString(),
      hoursUntilDue: Math.round(hoursUntilDue),
      urgency,
      status: task.status,
      pipelineStep: task.pipelineStep,
      dealId: task.deal.id,
      dealName: task.deal.name,
      dealStatus: task.deal.status,
    };
  });

  // Sort by urgency: black first, then red, yellow, green
  const urgencyOrder: Record<string, number> = { black: 0, red: 1, yellow: 2, green: 3 };
  deadlines.sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4)
  );

  return NextResponse.json({ deadlines, total: deadlines.length });
}

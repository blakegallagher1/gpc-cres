import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import "@/lib/automation/handlers";

// GET /api/deals/[id]/tasks
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify deal belongs to user's org
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const tasks = await prisma.task.findMany({
      where: { dealId: id },
      orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST /api/deals/[id]/tasks - create a new task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.title || body.pipelineStep == null) {
      return NextResponse.json(
        { error: "title and pipelineStep are required" },
        { status: 400 }
      );
    }

    // Verify deal belongs to user's org
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const task = await prisma.task.create({
      data: {
        orgId: auth.orgId,
        dealId: id,
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? "TODO",
        pipelineStep: body.pipelineStep,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        ownerUserId: body.ownerUserId ?? null,
      },
    });

    // Dispatch task.created event for automation
    dispatchEvent({
      type: "task.created",
      dealId: id,
      taskId: task.id,
      orgId: auth.orgId,
    }).catch(() => {});

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

// PATCH /api/deals/[id]/tasks - update a task (expects taskId in body)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.taskId) {
      return NextResponse.json(
        { error: "taskId is required" },
        { status: 400 }
      );
    }

    // Verify deal belongs to user's org
    const deal = await prisma.deal.findFirst({
      where: { id, orgId: auth.orgId },
      select: { id: true },
    });
    if (!deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Verify task belongs to this deal
    const existingTask = await prisma.task.findFirst({
      where: { id: body.taskId, dealId: id },
      select: { id: true, status: true },
    });
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const allowedFields = ["title", "description", "status", "dueAt", "ownerUserId", "pipelineStep"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === "dueAt" && body[field]) {
          data[field] = new Date(body[field]);
        } else {
          data[field] = body[field];
        }
      }
    }

    const task = await prisma.task.update({
      where: { id: body.taskId },
      data,
    });

    // Dispatch task.completed when status transitions to DONE
    if (data.status === "DONE" && existingTask.status !== "DONE") {
      dispatchEvent({
        type: "task.completed",
        dealId: id,
        taskId: task.id,
        orgId: auth.orgId,
      }).catch(() => {});
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

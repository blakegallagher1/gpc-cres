import { NextRequest, NextResponse } from "next/server";
import {
  DealAccessError,
  DealTaskNotFoundError,
  createDealTask,
  listDealTasks,
  updateDealTask,
} from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { dispatchEvent } from "@/lib/automation/events";
import { captureAutomationDispatchError } from "@/lib/automation/sentry";
import "@/lib/automation/handlers";
import * as Sentry from "@sentry/nextjs";

const TASK_STATUSES = new Set([
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELED",
] as const);

// GET /api/deals/[id]/tasks
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { tasks } = await listDealTasks({ dealId: id, orgId: auth.orgId });

    return NextResponse.json({ tasks });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 404 ? "Deal not found" : "Forbidden" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.tasks", method: "GET" },
    });
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
    const auth = await resolveAuth(request);
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

    const pipelineStep = Number(body.pipelineStep);
    if (!Number.isInteger(pipelineStep) || pipelineStep < 0) {
      return NextResponse.json(
        { error: "pipelineStep must be a non-negative integer" },
        { status: 400 }
      );
    }

    const status =
      typeof body.status === "string" ? body.status.toUpperCase() : "TODO";
    if (!TASK_STATUSES.has(status as (typeof TASK_STATUSES extends Set<infer T> ? T : never))) {
      return NextResponse.json(
        { error: "status must be one of TODO, IN_PROGRESS, BLOCKED, DONE, CANCELED" },
        { status: 400 },
      );
    }

    const { task } = await createDealTask({
      dealId: id,
      orgId: auth.orgId,
      title: body.title,
      description: body.description ?? null,
      status,
      pipelineStep,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      ownerUserId: body.ownerUserId ?? null,
    });

    // Dispatch task.created event for automation
    dispatchEvent({
      type: "task.created",
      dealId: id,
      taskId: task.id,
      orgId: auth.orgId,
    }).catch((error) => {
      captureAutomationDispatchError(error, {
        handler: "api.deals.tasks.create",
        eventType: "task.created",
        dealId: id,
        orgId: auth.orgId,
      });
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 404 ? "Deal not found" : "Forbidden" },
        { status: error.status },
      );
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.tasks", method: "POST" },
    });
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
    const auth = await resolveAuth(request);
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

    const allowedFields = ["title", "description", "status", "dueAt", "ownerUserId", "pipelineStep"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        if (field === "dueAt" && body[field]) {
          data[field] = new Date(body[field]);
        } else if (field === "pipelineStep") {
          const pipelineStep = Number(body[field]);
          if (!Number.isInteger(pipelineStep) || pipelineStep < 0) {
            return NextResponse.json(
              { error: "pipelineStep must be a non-negative integer" },
              { status: 400 },
            );
          }
          data[field] = pipelineStep;
        } else if (field === "status") {
          if (typeof body[field] !== "string") {
            return NextResponse.json(
              { error: "status must be a string" },
              { status: 400 },
            );
          }
          const status = body[field].toUpperCase();
          if (!TASK_STATUSES.has(status as (typeof TASK_STATUSES extends Set<infer T> ? T : never))) {
            return NextResponse.json(
              { error: "status must be one of TODO, IN_PROGRESS, BLOCKED, DONE, CANCELED" },
              { status: 400 },
            );
          }
          data[field] = status;
        } else {
          data[field] = body[field];
        }
      }
    }

    const { task, completedTransition } = await updateDealTask({
      dealId: id,
      orgId: auth.orgId,
      taskId: body.taskId,
      data,
    });

    // Dispatch task.completed when status transitions to DONE
    if (completedTransition) {
      dispatchEvent({
        type: "task.completed",
        dealId: id,
        taskId: task.id,
        orgId: auth.orgId,
      }).catch((error) => {
        captureAutomationDispatchError(error, {
          handler: "api.deals.tasks.update",
          eventType: "task.completed",
          dealId: id,
          orgId: auth.orgId,
          status: "DONE",
        });
      });
    }

    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof DealAccessError) {
      return NextResponse.json(
        { error: error.status === 404 ? "Deal not found" : "Forbidden" },
        { status: error.status },
      );
    }
    if (error instanceof DealTaskNotFoundError) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    Sentry.captureException(error, {
      tags: { route: "api.deals.tasks", method: "PATCH" },
    });
    console.error("Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

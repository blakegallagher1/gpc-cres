import { tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";

export const createTask = tool({
  name: "create_task",
  description: "Create a task on a deal (e.g. 'Pre-app meeting with planning dept')",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal this task belongs to"),
    title: z.string().min(1).describe("Task title"),
    description: z.string().optional().describe("Detailed task description"),
    pipelineStep: z
      .number()
      .int()
      .min(1)
      .max(8)
      .describe(
        "Pipeline step (1=Intake, 2=Triage, 3=PreApp, 4=Concept, 5=Neighbors, 6=Submitted, 7=Hearing, 8=Approved)",
      ),
    dueAt: z
      .string()
      .optional()
      .describe("Optional due date (ISO 8601 datetime)"),
    ownerUserId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional user ID to assign this task to"),
  }),
  execute: async ({ orgId, dealId, title, description, pipelineStep, dueAt, ownerUserId }) => {
    // Verify the deal belongs to the org
    const deal = await prisma.deal.findFirst({
      where: { id: dealId, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const task = await prisma.task.create({
      data: {
        orgId,
        dealId,
        title,
        description: description ?? null,
        pipelineStep,
        dueAt: dueAt ? new Date(dueAt) : null,
        ownerUserId: ownerUserId ?? null,
      },
    });
    return JSON.stringify(task);
  },
});

export const updateTask = tool({
  name: "update_task",
  description: "Update a task's status or details",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    taskId: z.string().uuid().describe("The task ID to update"),
    status: z
      .enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"])
      .optional()
      .describe("New task status"),
    title: z.string().min(1).optional().describe("Updated task title"),
    description: z.string().optional().describe("Updated task description"),
    dueAt: z
      .string()
      .optional()
      .describe("Updated due date (ISO 8601 datetime)"),
    ownerUserId: z
      .string()
      .uuid()
      .optional()
      .describe("Updated owner user ID"),
  }),
  execute: async ({ orgId, taskId, status, title, description, dueAt, ownerUserId }) => {
    const result = await prisma.task.updateMany({
      where: { id: taskId, orgId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(dueAt !== undefined ? { dueAt: new Date(dueAt) } : {}),
        ...(ownerUserId !== undefined ? { ownerUserId } : {}),
      },
    });
    if (result.count === 0) {
      return JSON.stringify({ error: "Task not found or access denied" });
    }
    const updated = await prisma.task.findFirstOrThrow({
      where: { id: taskId, orgId },
    });
    return JSON.stringify(updated);
  },
});

export const listTasks = tool({
  name: "list_tasks",
  description: "List tasks for a deal, optionally filtered by status",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    dealId: z.string().uuid().describe("The deal ID to list tasks for"),
    status: z
      .enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"])
      .optional()
      .describe("Filter by task status"),
  }),
  execute: async ({ orgId, dealId, status }) => {
    const tasks = await prisma.task.findMany({
      where: {
        orgId,
        dealId,
        ...(status ? { status } : {}),
      },
      include: {
        owner: { select: { id: true, email: true } },
      },
      orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }],
    });
    return JSON.stringify(tasks);
  },
});

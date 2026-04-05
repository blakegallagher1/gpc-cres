import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  taskFindManyMock,
  taskCreateMock,
  taskFindFirstMock,
  taskUpdateMock,
  dispatchEventMock,
  captureAutomationDispatchErrorMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  taskFindManyMock: vi.fn(),
  taskCreateMock: vi.fn(),
  taskFindFirstMock: vi.fn(),
  taskUpdateMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  captureAutomationDispatchErrorMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: {
      findFirst: dealFindFirstMock,
    },
    task: {
      findMany: taskFindManyMock,
      create: taskCreateMock,
      findFirst: taskFindFirstMock,
      update: taskUpdateMock,
    },
  },
}));

vi.mock("@/lib/automation/events", () => ({
  dispatchEvent: dispatchEventMock,
}));

vi.mock("@/lib/automation/sentry", () => ({
  captureAutomationDispatchError: captureAutomationDispatchErrorMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { GET, PATCH, POST } from "./route";

describe("/api/deals/[id]/tasks route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    dealFindFirstMock.mockReset();
    taskFindManyMock.mockReset();
    taskCreateMock.mockReset();
    taskFindFirstMock.mockReset();
    taskUpdateMock.mockReset();
    dispatchEventMock.mockReset();
    captureAutomationDispatchErrorMock.mockReset();
    captureExceptionMock.mockReset();
    dispatchEventMock.mockResolvedValue(undefined);
  });

  it("returns 401 from GET when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/tasks"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns deal tasks when the deal belongs to the auth org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    taskFindManyMock.mockResolvedValue([{ id: "task-1", title: "Call surveyor" }]);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/tasks"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tasks: [{ id: "task-1", title: "Call surveyor" }] });
    expect(taskFindManyMock).toHaveBeenCalledWith({
      where: { dealId: "deal-1" },
      orderBy: [{ pipelineStep: "asc" }, { createdAt: "asc" }],
    });
  });

  it("creates a task and dispatches task.created", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    taskCreateMock.mockResolvedValue({ id: "task-2", title: "Order survey" });

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Order survey", pipelineStep: 2 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1" }) });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ task: { id: "task-2", title: "Order survey" } });
    expect(taskCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        dealId: "deal-1",
        title: "Order survey",
        pipelineStep: 2,
        status: "TODO",
      }),
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "task.created",
      dealId: "deal-1",
      taskId: "task-2",
      orgId: "org-1",
    });
  });

  it("returns 400 from POST for invalid pipelineStep", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Order survey", pipelineStep: -1 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1" }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "pipelineStep must be a non-negative integer" });
  });

  it("updates a task and dispatches task.completed when transitioning to DONE", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    taskFindFirstMock.mockResolvedValue({ id: "task-1", status: "TODO" });
    taskUpdateMock.mockResolvedValue({ id: "task-1", status: "DONE" });

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks", {
      method: "PATCH",
      body: JSON.stringify({ taskId: "task-1", status: "DONE", pipelineStep: 3 }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "deal-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ task: { id: "task-1", status: "DONE" } });
    expect(taskUpdateMock).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "DONE", pipelineStep: 3 },
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "task.completed",
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    });
  });
});
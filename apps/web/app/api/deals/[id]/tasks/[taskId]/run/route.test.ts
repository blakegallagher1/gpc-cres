import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  taskFindFirstMock,
  taskUpdateMock,
  dispatchEventMock,
  runAgentWorkflowMock,
  captureAutomationDispatchErrorMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  taskFindFirstMock: vi.fn(),
  taskUpdateMock: vi.fn(),
  dispatchEventMock: vi.fn(),
  runAgentWorkflowMock: vi.fn(),
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

vi.mock("@/lib/agent/agentRunner", () => ({
  runAgentWorkflow: runAgentWorkflowMock,
}));

vi.mock("@/lib/automation/handlers", () => ({}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

import { POST } from "./route";

function parseSsePayloads(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .flatMap((chunk) => {
      const line = chunk
        .split("\n")
        .find((candidate) => candidate.startsWith("data: "));
      if (!line) {
        return [];
      }
      return [JSON.parse(line.slice(6)) as Record<string, unknown>];
    });
}

describe("POST /api/deals/[id]/tasks/[taskId]/run", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    dealFindFirstMock.mockReset();
    taskFindFirstMock.mockReset();
    taskUpdateMock.mockReset();
    dispatchEventMock.mockReset();
    runAgentWorkflowMock.mockReset();
    captureAutomationDispatchErrorMock.mockReset();
    captureExceptionMock.mockReset();
    dispatchEventMock.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when deal is outside auth org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Deal not found" });
  });

  it("streams agent output, marks task done, and dispatches task.completed on success", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1", name: "Deal Alpha" });
    taskFindFirstMock.mockResolvedValue({
      id: "task-1",
      title: "Research zoning",
      description: "Check recent hearing outcomes",
      status: "TODO",
    });
    taskUpdateMock
      .mockResolvedValueOnce({ id: "task-1", status: "IN_PROGRESS" })
      .mockResolvedValueOnce({ id: "task-1", status: "DONE" });
    runAgentWorkflowMock.mockImplementation(async ({ onEvent }: { onEvent?: (event: Record<string, unknown>) => void }) => {
      onEvent?.({ type: "agent_switch", agentName: "Researcher" });
      onEvent?.({ type: "text_delta", content: "Found zoning support." });
      onEvent?.({ type: "done" });
      return { result: { status: "succeeded" } };
    });

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
      headers: { "x-request-id": "req-1" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });
    const events = parseSsePayloads(await res.text());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(runAgentWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        dealId: "deal-1",
        runType: "ENRICHMENT",
        correlationId: "req-1",
        persistConversation: false,
      }),
    );
    expect(taskUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "task-1" },
      data: { status: "IN_PROGRESS" },
    });
    expect(taskUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "task-1" },
      data: {
        status: "DONE",
        description: "Check recent hearing outcomes\n\n---\nAgent Findings (Researcher):\nFound zoning support.",
      },
    });
    expect(dispatchEventMock).toHaveBeenCalledWith({
      type: "task.completed",
      dealId: "deal-1",
      taskId: "task-1",
      orgId: "org-1",
    });
    expect(events.map((event) => event.type)).toEqual(["agent_switch", "text_delta", "done"]);
    expect(events[2]).toEqual({
      type: "done",
      taskId: "task-1",
      taskStatus: "DONE",
      agentName: "Researcher",
    });
  });

  it("reverts the task to TODO and streams failure events when the agent run throws", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1", name: "Deal Alpha" });
    taskFindFirstMock.mockResolvedValue({
      id: "task-1",
      title: "Research zoning",
      description: null,
      status: "TODO",
    });
    taskUpdateMock
      .mockResolvedValueOnce({ id: "task-1", status: "IN_PROGRESS" })
      .mockResolvedValueOnce({ id: "task-1", status: "TODO" });
    runAgentWorkflowMock.mockRejectedValue(new Error("workflow failed"));

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });
    const events = parseSsePayloads(await res.text());

    expect(res.status).toBe(200);
    expect(taskUpdateMock).toHaveBeenNthCalledWith(1, {
      where: { id: "task-1" },
      data: { status: "IN_PROGRESS" },
    });
    expect(taskUpdateMock).toHaveBeenNthCalledWith(2, {
      where: { id: "task-1" },
      data: { status: "TODO" },
    });
    expect(captureExceptionMock).toHaveBeenCalled();
    expect(dispatchEventMock).not.toHaveBeenCalled();
    expect(events).toEqual([
      { type: "error", message: "workflow failed" },
      { type: "done", taskId: "task-1", taskStatus: "FAILED", agentName: "Coordinator" },
    ]);
  });
});
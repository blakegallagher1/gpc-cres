import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  assertDealTaskAgentAccessMock,
  runDealTaskAgentMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  assertDealTaskAgentAccessMock: vi.fn(),
  runDealTaskAgentMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@gpc/server/deals/task-agent-run.service", () => ({
  assertDealTaskAgentAccess: assertDealTaskAgentAccessMock,
  runDealTaskAgent: runDealTaskAgentMock,
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
    assertDealTaskAgentAccessMock.mockReset();
    runDealTaskAgentMock.mockReset();
    captureExceptionMock.mockReset();
    assertDealTaskAgentAccessMock.mockResolvedValue(undefined);
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
    assertDealTaskAgentAccessMock.mockRejectedValue(new Error("Deal not found"));

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Deal not found" });
  });

  it("streams agent output, marks task done, and dispatches task.completed on success", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    runDealTaskAgentMock.mockImplementation(async ({ onEvent }: { onEvent?: (event: Record<string, unknown>) => void }) => {
      onEvent?.({ type: "agent_switch", agentName: "Researcher" });
      onEvent?.({ type: "text_delta", content: "Found zoning support." });
      return {
        taskId: "task-1",
        taskStatus: "DONE",
        agentName: "Researcher",
      };
    });

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
      headers: { "x-request-id": "req-1" },
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });
    const events = parseSsePayloads(await res.text());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(runDealTaskAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        dealId: "deal-1",
        correlationId: "req-1",
        taskId: "task-1",
      }),
    );
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
    runDealTaskAgentMock.mockRejectedValue(new Error("workflow failed"));

    const req = new NextRequest("http://localhost/api/deals/deal-1/tasks/task-1/run", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "deal-1", taskId: "task-1" }) });
    const events = parseSsePayloads(await res.text());

    expect(res.status).toBe(200);
    expect(captureExceptionMock).toHaveBeenCalled();
    expect(events).toEqual([
      { type: "error", message: "workflow failed" },
      { type: "done", taskId: "task-1", taskStatus: "FAILED", agentName: "Coordinator" },
    ]);
  });
});

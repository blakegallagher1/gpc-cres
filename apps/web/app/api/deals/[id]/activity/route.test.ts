import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  getDealActivityMock,
  DealNotFoundErrorMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  getDealActivityMock: vi.fn(),
  DealNotFoundErrorMock: class DealNotFoundError extends Error {
    constructor() {
      super("Deal not found");
      this.name = "DealNotFoundError";
    }
  },
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));
vi.mock("@gpc/server", () => ({
  getDealActivity: getDealActivityMock,
  DealNotFoundError: DealNotFoundErrorMock,
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/deals/[id]/activity", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    getDealActivityMock.mockReset();
    captureExceptionMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/activity"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the deal is not in the auth org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    getDealActivityMock.mockRejectedValue(new DealNotFoundErrorMock());

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/activity"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Deal not found" });
  });

  it("aggregates and sorts runs, tasks, uploads, and messages", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    getDealActivityMock.mockResolvedValue([
      {
        type: "message",
        timestamp: "2026-04-04T10:05:00.000Z",
        description: `Coordinator: ${"A".repeat(100)}...`,
        metadata: { messageId: "msg-1", role: "assistant" },
      },
      {
        type: "run",
        timestamp: "2026-04-04T10:01:00.000Z",
        description: "TRIAGE run succeeded",
        metadata: { runId: "run-1", status: "succeeded", runType: "TRIAGE" },
      },
      {
        type: "upload",
        timestamp: "2026-04-04T09:45:00.000Z",
        description: 'Uploaded "lease.pdf" (legal)',
        metadata: { uploadId: "upload-1", kind: "legal" },
      },
      {
        type: "task",
        timestamp: "2026-04-04T09:30:00.000Z",
        description: 'Task "Order survey" created (TODO)',
        metadata: { taskId: "task-1", status: "TODO" },
      },
    ]);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/activity"), {
      params: Promise.resolve({ id: "deal-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.activity).toHaveLength(4);
    expect(body.activity.map((item: { type: string }) => item.type)).toEqual([
      "message",
      "run",
      "upload",
      "task",
    ]);
    expect(body.activity[0].description).toContain("Coordinator:");
    expect(body.activity[0].description.endsWith("...")).toBe(true);
  });
});

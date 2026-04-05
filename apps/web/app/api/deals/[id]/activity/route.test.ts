import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  dealFindFirstMock,
  runFindManyMock,
  taskFindManyMock,
  uploadFindManyMock,
  conversationFindFirstMock,
  messageFindManyMock,
  captureExceptionMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  dealFindFirstMock: vi.fn(),
  runFindManyMock: vi.fn(),
  taskFindManyMock: vi.fn(),
  uploadFindManyMock: vi.fn(),
  conversationFindFirstMock: vi.fn(),
  messageFindManyMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({ resolveAuth: resolveAuthMock }));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    deal: { findFirst: dealFindFirstMock },
    run: { findMany: runFindManyMock },
    task: { findMany: taskFindManyMock },
    upload: { findMany: uploadFindManyMock },
    conversation: { findFirst: conversationFindFirstMock },
    message: { findMany: messageFindManyMock },
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: captureExceptionMock }));

import { GET } from "./route";

describe("GET /api/deals/[id]/activity", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    dealFindFirstMock.mockReset();
    runFindManyMock.mockReset();
    taskFindManyMock.mockReset();
    uploadFindManyMock.mockReset();
    conversationFindFirstMock.mockReset();
    messageFindManyMock.mockReset();
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
    dealFindFirstMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/deals/deal-1/activity"), {
      params: Promise.resolve({ id: "deal-1" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Deal not found" });
  });

  it("aggregates and sorts runs, tasks, uploads, and messages", async () => {
    resolveAuthMock.mockResolvedValue({ userId: "user-1", orgId: "org-1" });
    dealFindFirstMock.mockResolvedValue({ id: "deal-1" });
    runFindManyMock.mockResolvedValue([
      {
        id: "run-1",
        runType: "TRIAGE",
        status: "succeeded",
        startedAt: new Date("2026-04-04T10:00:00.000Z"),
        finishedAt: new Date("2026-04-04T10:01:00.000Z"),
      },
    ]);
    taskFindManyMock.mockResolvedValue([
      { id: "task-1", title: "Order survey", status: "TODO", createdAt: new Date("2026-04-04T09:30:00.000Z") },
    ]);
    uploadFindManyMock.mockResolvedValue([
      { id: "upload-1", filename: "lease.pdf", kind: "legal", createdAt: new Date("2026-04-04T09:45:00.000Z") },
    ]);
    conversationFindFirstMock.mockResolvedValue({ id: "conv-1" });
    messageFindManyMock.mockResolvedValue([
      {
        id: "msg-1",
        role: "assistant",
        agentName: "Coordinator",
        content: "A".repeat(120),
        createdAt: new Date("2026-04-04T10:05:00.000Z"),
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
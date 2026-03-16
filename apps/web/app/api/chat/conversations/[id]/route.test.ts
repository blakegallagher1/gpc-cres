import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  conversationFindFirstMock,
  conversationDeleteMock,
  runFindFirstMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  conversationFindFirstMock: vi.fn(),
  conversationDeleteMock: vi.fn(),
  runFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    conversation: {
      findFirst: conversationFindFirstMock,
      delete: conversationDeleteMock,
    },
    run: {
      findFirst: runFindFirstMock,
    },
  },
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: vi.fn(() => false),
}));

import { DELETE, GET } from "./route";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";

describe("/api/chat/conversations/[id]", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    conversationFindFirstMock.mockReset();
    conversationDeleteMock.mockReset();
    runFindFirstMock.mockReset();
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(false);
  });

  it("returns persisted metadata and pending approval recovery state", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindFirstMock.mockResolvedValue({
      id: "conv-1",
      title: "Parcel review",
      dealId: "deal-1",
      deal: { id: "deal-1", name: "Main Street", status: "ACTIVE" },
      createdAt: new Date("2026-03-12T10:00:00.000Z"),
      updatedAt: new Date("2026-03-12T10:10:00.000Z"),
      messages: [
        {
          id: "msg-1",
          role: "assistant",
          content: "Loaded parcel context.",
          agentName: "Coordinator",
          toolCalls: null,
          metadata: {
            kind: "chat_assistant_message",
            runId: "run-finished-1",
            openaiResponseId: "resp_123",
            mapFeatures: [{ parcelId: "parcel-1", address: "123 Main St" }],
          },
          createdAt: new Date("2026-03-12T10:05:00.000Z"),
        },
      ],
    });
    runFindFirstMock.mockResolvedValue({
      id: "run-pending-1",
      startedAt: new Date("2026-03-12T10:06:00.000Z"),
      outputJson: {
        pendingApproval: {
          conversationId: "conv-1",
          toolCallId: "call-42",
          toolName: "update_deal_status",
        },
      },
    });

    const req = new NextRequest("http://localhost/api/chat/conversations/conv-1");
    const res = await GET(req, { params: Promise.resolve({ id: "conv-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.conversation.messages).toEqual([
      {
        id: "msg-1",
        role: "assistant",
        content: "Loaded parcel context.",
        agentName: "Coordinator",
        toolCalls: null,
        metadata: {
          kind: "chat_assistant_message",
          runId: "run-finished-1",
          openaiResponseId: "resp_123",
          mapFeatures: [{ parcelId: "parcel-1", address: "123 Main St" }],
        },
        createdAt: "2026-03-12T10:05:00.000Z",
      },
      {
        id: "pending-approval-run-pending-1",
        role: "system",
        content: "Approval required for update_deal_status",
        agentName: null,
        toolCalls: [{ name: "update_deal_status" }],
        metadata: {
          kind: "tool_approval_requested",
          runId: "run-pending-1",
          toolCallId: "call-42",
          toolName: "update_deal_status",
          pendingApproval: true,
        },
        createdAt: "2026-03-12T10:06:00.000Z",
      },
    ]);
    expect(runFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "11111111-1111-4111-8111-111111111111",
          status: "running",
        }),
      }),
    );
  });

  it("degrades GET when persistence is unavailable", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindFirstMock.mockRejectedValue(
      new Error(
        "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      ),
    );
    runFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/chat/conversations/conv-1");
    const res = await GET(req, { params: Promise.resolve({ id: "conv-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversation: null, degraded: true });
  });

  it("returns a draft-safe null conversation when the record does not exist", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindFirstMock.mockResolvedValue(null);
    runFindFirstMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/chat/conversations/draft-1");
    const res = await GET(req, { params: Promise.resolve({ id: "draft-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversation: null });
  });

  it("short-circuits GET before Prisma when dev fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(true);

    const req = new NextRequest("http://localhost/api/chat/conversations/conv-1");
    const res = await GET(req, { params: Promise.resolve({ id: "conv-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ conversation: null, degraded: true });
    expect(conversationFindFirstMock).not.toHaveBeenCalled();
    expect(runFindFirstMock).not.toHaveBeenCalled();
  });

  it("returns 503 on DELETE when conversation storage is unavailable", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    conversationFindFirstMock.mockRejectedValue(
      new Error(
        "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      ),
    );

    const req = new NextRequest("http://localhost/api/chat/conversations/conv-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "conv-1" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Conversation store unavailable",
      degraded: true,
    });
    expect(conversationDeleteMock).not.toHaveBeenCalled();
  });

  it("short-circuits DELETE before Prisma when dev fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(true);

    const req = new NextRequest("http://localhost/api/chat/conversations/conv-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "conv-1" }) });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      error: "Conversation store unavailable",
      degraded: true,
    });
    expect(conversationFindFirstMock).not.toHaveBeenCalled();
    expect(conversationDeleteMock).not.toHaveBeenCalled();
  });
});

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeApiRouteMock,
  getConversationForOrgMock,
  deleteConversationForOrgMock,
  shouldUseAppDatabaseDevFallbackMock,
} = vi.hoisted(() => ({
  authorizeApiRouteMock: vi.fn(),
  getConversationForOrgMock: vi.fn(),
  deleteConversationForOrgMock: vi.fn(),
  shouldUseAppDatabaseDevFallbackMock: vi.fn(() => false),
}));

vi.mock("@/lib/auth/authorizeApiRoute", () => ({
  authorizeApiRoute: authorizeApiRouteMock,
}));

vi.mock("@gpc/server", () => ({
  getConversationForOrg: getConversationForOrgMock,
  deleteConversationForOrg: deleteConversationForOrgMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: shouldUseAppDatabaseDevFallbackMock,
}));

import { DELETE, GET } from "./route";

const CONVERSATION_ID = "11111111-1111-4111-8111-111111111111";

describe("/api/chat/conversations/[id]", () => {
  beforeEach(() => {
    authorizeApiRouteMock.mockReset();
    getConversationForOrgMock.mockReset();
    deleteConversationForOrgMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the persisted conversation payload", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    getConversationForOrgMock.mockResolvedValue({
      id: CONVERSATION_ID,
      title: "Parcel review",
      dealId: "deal-1",
      deal: { id: "deal-1", name: "Main Street", status: "ACTIVE" },
      createdAt: "2026-03-12T10:00:00.000Z",
      updatedAt: "2026-03-12T10:10:00.000Z",
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
          },
          createdAt: "2026-03-12T10:05:00.000Z",
        },
      ],
    });

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversation: {
        id: CONVERSATION_ID,
        title: "Parcel review",
        dealId: "deal-1",
        deal: { id: "deal-1", name: "Main Street", status: "ACTIVE" },
        createdAt: "2026-03-12T10:00:00.000Z",
        updatedAt: "2026-03-12T10:10:00.000Z",
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
            },
            createdAt: "2026-03-12T10:05:00.000Z",
          },
        ],
      },
    });
    expect(getConversationForOrgMock).toHaveBeenCalledWith("org-1", CONVERSATION_ID);
  });

  it("returns a null conversation when the record does not exist", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    getConversationForOrgMock.mockResolvedValue(null);

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation: null });
  });

  it("degrades GET when persistence is unavailable", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    getConversationForOrgMock.mockRejectedValue(
      new Error(
        "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      ),
    );

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation: null, degraded: true });
  });

  it("short-circuits GET before service access when dev fallback is active", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversation: null, degraded: true });
    expect(getConversationForOrgMock).not.toHaveBeenCalled();
  });

  it("returns 404 when delete target does not exist", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    deleteConversationForOrgMock.mockResolvedValue(false);

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Conversation not found" });
  });

  it("returns success when delete succeeds", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    deleteConversationForOrgMock.mockResolvedValue(true);

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteConversationForOrgMock).toHaveBeenCalledWith("org-1", CONVERSATION_ID);
  });

  it("returns 503 on DELETE when conversation storage is unavailable", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: true,
      auth: { orgId: "org-1", userId: "user-1" },
    });
    deleteConversationForOrgMock.mockRejectedValue(
      new Error(
        "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      ),
    );

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Conversation store unavailable",
      degraded: true,
    });
  });

  it("returns the authorization response when auth resolution fails upstream", async () => {
    authorizeApiRouteMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const req = new NextRequest(
      `http://localhost/api/chat/conversations/${CONVERSATION_ID}`,
    );
    const res = await GET(req, {
      params: Promise.resolve({ id: CONVERSATION_ID }),
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, resumeAgentToolApprovalMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  resumeAgentToolApprovalMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/agent/executeAgent", () => ({
  resumeAgentToolApproval: resumeAgentToolApprovalMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: vi.fn(() => false),
}));

import { POST } from "./route";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";

describe("POST /api/chat/tool-approval", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    resumeAgentToolApprovalMock.mockReset();
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(false);
  });

  it("returns 401 when unauthenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({
        runId: "run-1",
        toolCallId: "call-1",
        action: "approve",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(resumeAgentToolApprovalMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });

    const req = new NextRequest("http://localhost/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({
        runId: "run-1",
        action: "approve",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("runId, toolCallId, and action are required");
    expect(resumeAgentToolApprovalMock).not.toHaveBeenCalled();
  });

  it("returns events after approval decision is applied", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    resumeAgentToolApprovalMock.mockImplementation(
      async (params: { onEvent?: (event: Record<string, unknown>) => void }) => {
        params.onEvent?.({
          type: "tool_end",
          name: "update_deal_status",
          status: "completed",
        });
      },
    );

    const req = new NextRequest("http://localhost/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({
        runId: "run-1",
        toolCallId: "call-1",
        action: "approve",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.events).toEqual([
      {
        type: "tool_end",
        name: "update_deal_status",
        status: "completed",
      },
    ]);
    expect(resumeAgentToolApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "11111111-1111-4111-8111-111111111111",
        userId: "99999999-9999-4999-8999-999999999999",
        runId: "run-1",
        toolCallId: "call-1",
        action: "approve",
      }),
    );
  });

  it("sanitizes internal persistence errors", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    resumeAgentToolApprovalMock.mockRejectedValue(
      new Error(
        "PrismaClientInitializationError: Environment variable not found: DATABASE_URL",
      ),
    );

    const req = new NextRequest("http://localhost/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({
        runId: "run-1",
        toolCallId: "call-1",
        action: "approve",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "System configuration error. Please contact admin.",
      code: "system_configuration_error",
      events: [],
    });
  });

  it("short-circuits before approval resume when dev fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({
      userId: "99999999-9999-4999-8999-999999999999",
      orgId: "11111111-1111-4111-8111-111111111111",
    });
    vi.mocked(shouldUseAppDatabaseDevFallback).mockReturnValue(true);

    const req = new NextRequest("http://localhost/api/chat/tool-approval", {
      method: "POST",
      body: JSON.stringify({
        runId: "run-1",
        toolCallId: "call-1",
        action: "approve",
      }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({
      error: "System configuration error. Please contact admin.",
      code: "system_configuration_error",
      events: [],
    });
    expect(resumeAgentToolApprovalMock).not.toHaveBeenCalled();
  });
});
